/**
 * Copyright 2023-present DreamNum Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Workbook } from '@univerjs/core';
import { Disposable, IAuthzIoService, IPermissionService, IUniverInstanceService, LifecycleStages, OnLifecycle, UniverInstanceType, UserManagerService } from '@univerjs/core';

import type { IRangeProtectionRule, IWorksheetProtectionRenderCellData } from '@univerjs/sheets';
import { defaultWorkbookPermissionPoints, defaultWorksheetPermissionPoint, getAllRangePermissionPoint, getAllWorkbookPermissionPoint, getAllWorksheetPermissionPoint, getAllWorksheetPermissionPointByPointPanel, INTERCEPTOR_POINT, RangeProtectionRenderModel, RangeProtectionRuleModel, SheetInterceptorService, WorksheetEditPermission, WorksheetProtectionPointModel, WorksheetProtectionRuleModel, WorksheetViewPermission } from '@univerjs/sheets';
import { Inject } from '@wendellhu/redi';
import { IDialogService } from '@univerjs/ui';

import { UnitAction, UnitObject, UniverType } from '@univerjs/protocol';

import type { ISheetFontRenderExtension } from '@univerjs/engine-render';
import type { IRangeProtectionRenderCellData } from '../../views/permission/extensions/range-protection.render';

@OnLifecycle(LifecycleStages.Rendered, SheetPermissionInitController)
export class SheetPermissionInitController extends Disposable {
    constructor(
        @IUniverInstanceService private readonly _univerInstanceService: IUniverInstanceService,
        @IDialogService private readonly _dialogService: IDialogService,
        @IPermissionService private _permissionService: IPermissionService,
        @IAuthzIoService private _authzIoService: IAuthzIoService,
        @Inject(RangeProtectionRuleModel) private _rangeProtectionRuleModel: RangeProtectionRuleModel,
        @Inject(WorksheetProtectionRuleModel) private _worksheetProtectionRuleModel: WorksheetProtectionRuleModel,
        @Inject(UserManagerService) private _userManagerService: UserManagerService,
        @Inject(WorksheetProtectionPointModel) private _worksheetProtectionPointRuleModel: WorksheetProtectionPointModel,
        @Inject(SheetInterceptorService) private _sheetInterceptorService: SheetInterceptorService,
        @Inject(RangeProtectionRenderModel) private _selectionProtectionRenderModel: RangeProtectionRenderModel
    ) {
        super();
        this._initRangePermissionFromSnapshot();
        this._initRangePermissionChange();
        this._initWorksheetPermissionFromSnapshot();
        this._initWorksheetPermissionChange();
        this._initWorksheetPermissionPointsChange();
        this.initWorkbookPermissionChange();
        this._initUserChange();
        this._initViewModelByRangeInterceptor();
        this._initViewModelBySheetInterceptor();
    }

    private _initRangePermissionFromSnapshot() {
        const allAllowedParams: {
            objectID: string;
            unitID: string;
            objectType: UnitObject;
            actions: UnitAction[];
        }[] = [];
        const workbook = this._univerInstanceService.getCurrentUnitForType<Workbook>(UniverType.UNIVER_SHEET)!;
        const unitId = workbook.getUnitId();
        const allSheets = workbook.getSheets();
        const permissionIdWithRuleInstanceMap = new Map();
        allSheets.forEach((sheet) => {
            const subunitId = sheet.getSheetId();
            this._rangeProtectionRuleModel.getSubunitRuleList(unitId, subunitId).forEach((rule) => {
                permissionIdWithRuleInstanceMap.set(rule.permissionId, rule);
                allAllowedParams.push({
                    objectID: rule.permissionId,
                    unitID: unitId,
                    objectType: UnitObject.SelectRange,
                    actions: [UnitAction.View, UnitAction.Edit],
                });
            });
        });

        if (!allAllowedParams.length) {
            return;
        }

        this._authzIoService.batchAllowed(allAllowedParams).then((permissionMap) => {
            permissionMap.forEach((item) => {
                const rule = permissionIdWithRuleInstanceMap.get(item.objectID);
                if (rule) {
                    getAllRangePermissionPoint().forEach((F) => {
                        const instance = new F(unitId, rule.subUnitId, item.objectID);
                        const unitActionName = instance.subType;
                        const result = item.actions.find((action) => action.action === unitActionName);
                        if (result?.allowed !== undefined) {
                            this._permissionService.updatePermissionPoint(instance.id, result.allowed);
                        }
                    });
                }
            });
        });
    }

    private _initRangePermissionChange() {
        this.disposeWithMe(
            this._rangeProtectionRuleModel.ruleChange$.subscribe((info) => {
                if (info.type !== 'delete') {
                    this._authzIoService.allowed({
                        objectID: info.rule.permissionId,
                        unitID: info.unitId,
                        objectType: UnitObject.SelectRange,
                        actions: [UnitAction.Edit, UnitAction.View],
                    }).then((actionList) => {
                        getAllRangePermissionPoint().forEach((F) => {
                            if (info.type === 'set') {
                                const { rule, oldRule } = info;
                                if (rule.permissionId === oldRule?.permissionId) {
                                    return;
                                }
                            }
                            const rule = info.rule;
                            const instance = new F(rule.unitId, rule.subUnitId, rule.permissionId);
                            const unitActionName = instance.subType;
                            const action = actionList.find((item) => item.action === unitActionName);
                            if (action) {
                                this._permissionService.updatePermissionPoint(instance.id, action.allowed);
                            }
                        });
                    });
                } else {
                    const ruleList = this._rangeProtectionRuleModel.getSubunitRuleList(info.unitId, info.subUnitId);
                    if (ruleList.length === 0) {
                        this._worksheetProtectionPointRuleModel.deleteRule(info.unitId, info.subUnitId);
                        [...getAllWorksheetPermissionPointByPointPanel()].forEach((F) => {
                            const instance = new F(info.unitId, info.subUnitId);
                            this._permissionService.addPermissionPoint(instance);
                        });
                    }
                }
            })
        );
    }

    public initWorkbookPermissionChange(_unitId?: string) {
        const unitId = _unitId || this._univerInstanceService.getCurrentUnitForType<Workbook>(UniverInstanceType.UNIVER_SHEET)!.getUnitId();
        this._authzIoService.allowed({
            objectID: unitId,
            objectType: UnitObject.Workbook,
            unitID: unitId,
            actions: defaultWorkbookPermissionPoints,
        }).then((actionList) => {
            getAllWorkbookPermissionPoint().forEach((F) => {
                const instance = new F(unitId);
                const unitActionName = instance.subType;
                const action = actionList.find((item) => item.action === unitActionName);
                if (action) {
                    this._permissionService.updatePermissionPoint(instance.id, action.allowed);
                }
            });
        });
    }

    private _initWorksheetPermissionChange() {
        this.disposeWithMe(
            this._worksheetProtectionRuleModel.ruleChange$.subscribe((info) => {
                if (info.type !== 'delete') {
                    this._authzIoService.allowed({
                        objectID: info.rule.permissionId,
                        unitID: info.unitId,
                        objectType: UnitObject.Worksheet,
                        actions: [UnitAction.Edit, UnitAction.View],
                    }).then((actionList) => {
                        getAllWorksheetPermissionPoint().forEach((F) => {
                            const instance = new F(info.unitId, info.subUnitId);
                            const unitActionName = instance.subType;
                            const action = actionList.find((item) => item.action === unitActionName);
                            if (action) {
                                this._permissionService.updatePermissionPoint(instance.id, action.allowed);
                            }
                        });
                    });
                } else {
                    [...getAllWorksheetPermissionPoint(), ...getAllWorksheetPermissionPointByPointPanel()].forEach((F) => {
                        const instance = new F(info.unitId, info.subUnitId);
                        this._permissionService.updatePermissionPoint(instance.id, true);
                    });
                    this._worksheetProtectionPointRuleModel.deleteRule(info.unitId, info.subUnitId);
                }
            })
        );
    }

    private _initWorksheetPermissionPointsChange() {
        this.disposeWithMe(
            this._worksheetProtectionPointRuleModel.pointChange$.subscribe((info) => {
                this._authzIoService.allowed({
                    objectID: info.permissionId,
                    unitID: info.unitId,
                    objectType: UnitObject.Worksheet,
                    actions: defaultWorksheetPermissionPoint,
                }).then((actionList) => {
                    getAllWorksheetPermissionPointByPointPanel().forEach((F) => {
                        const instance = new F(info.unitId, info.subUnitId);
                        const unitActionName = instance.subType;
                        const action = actionList.find((item) => item.action === unitActionName);
                        if (action) {
                            this._permissionService.updatePermissionPoint(instance.id, action.allowed);
                        }
                    });
                });
            })
        );
    }

    private _initWorksheetPermissionFromSnapshot() {
        const allAllowedParams: {
            objectID: string;
            unitID: string;
            objectType: UnitObject;
            actions: UnitAction[];
        }[] = [];
        const workbook = this._univerInstanceService.getCurrentUnitForType<Workbook>(UniverType.UNIVER_SHEET)!;
        const unitId = workbook.getUnitId();
        const allSheets = workbook.getSheets();
        const permissionIdWithRuleInstanceMap = new Map();
        allSheets.forEach((sheet) => {
            const subUnitId = sheet.getSheetId();
            const rule = this._worksheetProtectionRuleModel.getRule(unitId, subUnitId);
            if (rule) {
                permissionIdWithRuleInstanceMap.set(rule.permissionId, rule);
                allAllowedParams.push({
                    objectID: rule.permissionId,
                    unitID: unitId,
                    objectType: UnitObject.Worksheet,
                    actions: [UnitAction.Edit, UnitAction.View],
                });
            }

            const pointRule = this._worksheetProtectionPointRuleModel.getRule(unitId, subUnitId);
            if (pointRule) {
                permissionIdWithRuleInstanceMap.set(pointRule.permissionId, pointRule);
                allAllowedParams.push({
                    objectID: pointRule.permissionId,
                    unitID: unitId,
                    objectType: UnitObject.Worksheet,
                    actions: defaultWorksheetPermissionPoint,
                });
            }
        });

        if (!allAllowedParams.length) {
            return;
        }

        this._authzIoService.batchAllowed(allAllowedParams).then((permissionMap) => {
            permissionMap.forEach((item) => {
                const rule = permissionIdWithRuleInstanceMap.get(item.objectID);
                if (rule) {
                    [...getAllWorksheetPermissionPoint(), ...getAllWorksheetPermissionPointByPointPanel()].forEach((F) => {
                        const instance = new F(unitId, rule.subUnitId);
                        const unitActionName = instance.subType;
                        const result = item.actions.find((action) => action.action === unitActionName);
                        if (result?.allowed !== undefined) {
                            this._permissionService.updatePermissionPoint(instance.id, result.allowed);
                        }
                    });
                }
            });
        });
    }

    private _initUserChange() {
        this.disposeWithMe(
            this._userManagerService.currentUser$.subscribe(() => {
                // This is to minimize the need for access providers to update the reference to permission points when the current user changes, reducing the integration steps required.
                // If not handled this way, the access providers would have to handle the changes in user and the resulting changes in permission point references.
                const _map = this._permissionService.getAllPermissionPoint();

                this._permissionService.clearPermissionMap();

                this._worksheetProtectionRuleModel.changeRuleInitState(false);

                const workbook = this._univerInstanceService.getCurrentUnitForType<Workbook>(UniverInstanceType.UNIVER_SHEET)!;
                const unitId = workbook.getUnitId();

                getAllWorkbookPermissionPoint().forEach((F) => {
                    let instance = new F(unitId);
                    if (_map.has(instance.id)) {
                        instance = _map.get(instance.id) as any;
                    }
                    this._permissionService.addPermissionPoint(instance);
                });

                workbook.getSheets().forEach((sheet) => {
                    const subUnitId = sheet.getSheetId();
                    [...getAllWorksheetPermissionPoint(), ...getAllWorksheetPermissionPointByPointPanel()].forEach((F) => {
                        let instance = new F(unitId, subUnitId);
                        if (_map.has(instance.id)) {
                            instance = _map.get(instance.id) as any;
                        }
                        this._permissionService.addPermissionPoint(instance);
                    });

                    const ruleList = this._rangeProtectionRuleModel.getSubunitRuleList(unitId, subUnitId);
                    ruleList.forEach((rule) => {
                        getAllRangePermissionPoint().forEach((F) => {
                            let instance = new F(unitId, subUnitId, rule.permissionId);
                            if (_map.has(instance.id)) {
                                instance = _map.get(instance.id) as any;
                            }
                            this._permissionService.addPermissionPoint(instance);
                        });
                    });
                });

                this.initWorkbookPermissionChange();
                this._initWorksheetPermissionFromSnapshot();
                this._initRangePermissionFromSnapshot();
            })
        );
    }

    private _initViewModelByRangeInterceptor() {
        this.disposeWithMe(this._sheetInterceptorService.intercept(INTERCEPTOR_POINT.CELL_CONTENT, {
            // permissions are placed at a high level to prioritize whether to filter subsequent renderings.
            priority: 999,
            handler: (cell = {}, context, next) => {
                const { unitId, subUnitId, row, col } = context;

                const permissionList = this._selectionProtectionRenderModel.getCellInfo(unitId, subUnitId, row, col)
                    .filter((p) => !!p.ruleId)
                    .map((p) => {
                        const rule = this._rangeProtectionRuleModel.getRule(unitId, subUnitId, p.ruleId!) || {} as IRangeProtectionRule;
                        return {
                            ...p, ranges: rule.ranges!,
                        };
                    })
                    .filter((p) => !!p.ranges);
                if (permissionList.length) {
                    const isSkipRender = permissionList.some((p) => !p?.[UnitAction.View]);
                    const _cellData: IRangeProtectionRenderCellData = { ...cell, selectionProtection: permissionList };
                    if (isSkipRender) {
                        delete _cellData.s;
                        delete _cellData.v;
                        delete _cellData.p;
                        return _cellData;
                    }
                    return next(_cellData);
                }
                return next(cell);
            },

        }
        ));
    }

    private _initViewModelBySheetInterceptor() {
        this.disposeWithMe(this._sheetInterceptorService.intercept(INTERCEPTOR_POINT.CELL_CONTENT, {
            // permissions are placed at a high level to prioritize whether to filter subsequent renderings.
            priority: 999,
            handler: (cell = {}, context, next) => {
                const { unitId, subUnitId } = context;
                const worksheetRule = this._worksheetProtectionRuleModel.getRule(unitId, subUnitId);
                if (worksheetRule?.permissionId && worksheetRule.name) {
                    const selectionProtection = [{
                        [UnitAction.View]: this._permissionService.getPermissionPoint(new WorksheetViewPermission(unitId, subUnitId).id)?.value ?? false,
                        [UnitAction.Edit]: this._permissionService.getPermissionPoint(new WorksheetEditPermission(unitId, subUnitId).id)?.value ?? false,
                    }];
                    const isSkipRender = !selectionProtection[0]?.[UnitAction.View];
                    const _cellData: IWorksheetProtectionRenderCellData & ISheetFontRenderExtension = { ...cell, hasWorksheetRule: true, selectionProtection };
                    if (isSkipRender) {
                        delete _cellData.s;
                        delete _cellData.v;
                        delete _cellData.p;
                        return _cellData;
                    }
                    return next(_cellData);
                }
                return next(cell);
            },
        }
        ));
    }
}
