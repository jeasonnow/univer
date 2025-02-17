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

import type { DependencyOverride, Nullable, Workbook } from '@univerjs/core';
import { Disposable, ICommandService, IUniverInstanceService, LifecycleStages, OnLifecycle, UniverInstanceType } from '@univerjs/core';
import type { MenuConfig } from '@univerjs/ui';
import { ComponentManager, IMenuService, IShortcutService } from '@univerjs/ui';
import { Inject, Injector } from '@wendellhu/redi';
import { CommentSingle } from '@univerjs/icons';
import { SetActiveCommentOperation, THREAD_COMMENT_PANEL, ThreadCommentPanelService } from '@univerjs/thread-comment-ui';
import type { ISetSelectionsOperationParams } from '@univerjs/sheets';
import { RangeProtectionPermissionViewPoint, SelectionMoveType, SetSelectionsOperation, SetWorksheetActiveOperation, WorkbookCommentPermission, WorksheetViewPermission } from '@univerjs/sheets';
import { singleReferenceToGrid } from '@univerjs/engine-formula';
import type { IDeleteCommentMutationParams } from '@univerjs/thread-comment';
import { DeleteCommentMutation } from '@univerjs/thread-comment';
import { IMarkSelectionService, ScrollToRangeOperation, SheetPermissionInterceptorBaseController } from '@univerjs/sheets-ui';
import { SheetsThreadCommentModel } from '@univerjs/sheets-thread-comment-base';
import { SheetsThreadCommentCell } from '../views/sheets-thread-comment-cell';
import { COMMENT_SINGLE_ICON, SHEETS_THREAD_COMMENT_MODAL } from '../types/const';
import { SheetsThreadCommentPanel } from '../views/sheets-thread-comment-panel';
import { SheetsThreadCommentPopupService } from '../services/sheets-thread-comment-popup.service';
import { AddCommentShortcut, threadCommentMenuFactory, threadPanelMenuFactory } from './menu';

export interface IUniverSheetsThreadCommentConfig {
    menu?: MenuConfig;
    overrides?: DependencyOverride;
}

export const DefaultSheetsThreadCommentConfig: IUniverSheetsThreadCommentConfig = {

};

interface ISelectionShapeInfo {
    shapeId: string;
    unitId: string;
    subUnitId: string;
    commentId: string;
}

@OnLifecycle(LifecycleStages.Starting, SheetsThreadCommentController)
export class SheetsThreadCommentController extends Disposable {
    private _isSwitchToCommenting = false;
    private _selectionShapeInfo: Nullable<ISelectionShapeInfo> = null;

    constructor(
        private readonly _config: Partial<IUniverSheetsThreadCommentConfig>,
        @IMenuService private readonly _menuService: IMenuService,
        @Inject(Injector) private readonly _injector: Injector,
        @Inject(ComponentManager) private readonly _componentManager: ComponentManager,
        @ICommandService private readonly _commandService: ICommandService,
        @Inject(SheetsThreadCommentPopupService) private readonly _sheetsThreadCommentPopupService: SheetsThreadCommentPopupService,
        @Inject(SheetsThreadCommentModel) private readonly _sheetsThreadCommentModel: SheetsThreadCommentModel,
        @Inject(ThreadCommentPanelService) private readonly _threadCommentPanelService: ThreadCommentPanelService,
        @IShortcutService private readonly _shortcutService: IShortcutService,
        @IUniverInstanceService private readonly _univerInstanceService: IUniverInstanceService,
        @Inject(SheetPermissionInterceptorBaseController) private readonly _sheetPermissionInterceptorBaseController: SheetPermissionInterceptorBaseController,
        @IMarkSelectionService private readonly _markSelectionService: IMarkSelectionService
    ) {
        super();
        this._initMenu();
        this._initShortcut();
        this._initComponent();
        this._initCommandListener();
        this._initPanelListener();
        this._initMarkSelection();
    }

    private _initShortcut() {
        this._shortcutService.registerShortcut(AddCommentShortcut);
    }

    private _initCommandListener() {
        this._commandService.onCommandExecuted((commandInfo) => {
            if (commandInfo.id === SetSelectionsOperation.id) {
                if (this._isSwitchToCommenting) {
                    return;
                }
                const params = commandInfo.params as ISetSelectionsOperationParams;
                const { unitId, subUnitId, selections, type } = params;
                if ((type === SelectionMoveType.MOVE_END || type === undefined) && selections[0].primary) {
                    const range = selections[0].range;
                    if (range.endColumn - range.startColumn > 0 || range.endRow - range.startRow > 0) {
                        return;
                    }
                    const row = selections[0].primary.actualRow;
                    const col = selections[0].primary.actualColumn;
                    if (!this._sheetsThreadCommentModel.showCommentMarker(unitId, subUnitId, row, col)) {
                        if (this._threadCommentPanelService.activeCommentId) {
                            this._commandService.executeCommand(SetActiveCommentOperation.id);
                        }
                        return;
                    }

                    const commentId = this._sheetsThreadCommentModel.getByLocation(unitId, subUnitId, row, col);
                    if (commentId) {
                        this._commandService.executeCommand(SetActiveCommentOperation.id, {
                            unitId,
                            subUnitId,
                            commentId,
                        });
                    }
                }
            }

            if (commandInfo.id === DeleteCommentMutation.id) {
                const params = commandInfo.params as IDeleteCommentMutationParams;
                const active = this._sheetsThreadCommentPopupService.activePopup;
                if (!active) {
                    return;
                }
                const { unitId, subUnitId, commentId } = active;
                if (params.unitId === unitId && params.subUnitId === subUnitId && params.commentId === commentId) {
                    this._sheetsThreadCommentPopupService.hidePopup();
                }
            }
        });
    }

    private _initMenu() {
        const { menu = {} } = this._config;

        [
            threadCommentMenuFactory,
            threadPanelMenuFactory,
        ].forEach((menuFactory) => {
            this._menuService.addMenuItem(menuFactory(this._injector), menu);
        });
    }

    private _initComponent() {
        ([
            [SHEETS_THREAD_COMMENT_MODAL, SheetsThreadCommentCell],
            [THREAD_COMMENT_PANEL, SheetsThreadCommentPanel],
            [COMMENT_SINGLE_ICON, CommentSingle],
        ] as const).forEach(([key, comp]) => {
            this._componentManager.register(key, comp);
        });
    }

    private _initPanelListener() {
        this.disposeWithMe(this._threadCommentPanelService.activeCommentId$.subscribe(async (commentInfo) => {
            if (commentInfo) {
                const { unitId, subUnitId, commentId, trigger } = commentInfo;
                const comment = this._sheetsThreadCommentModel.getComment(unitId, subUnitId, commentId);
                if (!comment || comment.resolved) {
                    return;
                }

                const currentUnit = this._univerInstanceService.getCurrentUnitForType<Workbook>(UniverInstanceType.UNIVER_SHEET);
                if (!currentUnit) {
                    return;
                }
                const currentUnitId = currentUnit.getUnitId();
                if (currentUnitId !== unitId) {
                    return;
                }
                this._isSwitchToCommenting = true;
                const currentSheetId = currentUnit.getActiveSheet()?.getSheetId();
                if (currentSheetId !== subUnitId) {
                    await this._commandService.executeCommand(SetWorksheetActiveOperation.id, {
                        unitId,
                        subUnitId,
                    });
                }
                this._isSwitchToCommenting = false;

                const location = singleReferenceToGrid(comment.ref);

                const { row, column: col } = location;
                const commentPermission = this._sheetPermissionInterceptorBaseController.permissionCheckWithRanges({
                    workbookTypes: [WorkbookCommentPermission],
                    worksheetTypes: [WorksheetViewPermission],
                    rangeTypes: [RangeProtectionPermissionViewPoint],
                }, [{ startRow: row, startColumn: col, endRow: row, endColumn: col }]);

                if (!commentPermission) {
                    return;
                }

                const GAP = 1;
                await this._commandService.executeCommand(ScrollToRangeOperation.id, {
                    range: {
                        startRow: Math.max(location.row - GAP, 0),
                        endRow: location.row + GAP,
                        startColumn: Math.max(location.column - GAP, 0),
                        endColumn: location.column + GAP,
                    },
                });

                this._sheetsThreadCommentPopupService.showPopup({
                    unitId,
                    subUnitId,
                    row: location.row,
                    col: location.column,
                    commentId: comment.id,
                    trigger,
                });
            } else {
                this._sheetsThreadCommentPopupService.hidePopup();
            }
        }));
    }

    private _initMarkSelection() {
        this.disposeWithMe(this._threadCommentPanelService.activeCommentId$.subscribe((activeComment) => {
            if (!activeComment) {
                if (this._selectionShapeInfo) {
                    this._markSelectionService.removeShape(this._selectionShapeInfo.shapeId);
                    this._selectionShapeInfo = null;
                }
                return;
            }
            const { unitId, subUnitId, commentId } = activeComment;
            if (this._selectionShapeInfo) {
                if (this._selectionShapeInfo.unitId === unitId && this._selectionShapeInfo.subUnitId === subUnitId && this._selectionShapeInfo.commentId === commentId) {
                    return;
                }

                this._markSelectionService.removeShape(this._selectionShapeInfo.shapeId);
                this._selectionShapeInfo = null;
            }
            const comment = this._sheetsThreadCommentModel.getComment(unitId, subUnitId, commentId);
            if (!comment) {
                return;
            }

            const location = singleReferenceToGrid(comment.ref);

            const { row, column } = location;
            if (Number.isNaN(row) || Number.isNaN(column)) {
                return;
            }

            const shapeId = this._markSelectionService.addShape({
                range: {
                    startColumn: column,
                    endColumn: column,
                    startRow: row,
                    endRow: row,
                },
                style: {
                    hasAutoFill: false,
                    fill: 'rgb(255, 189, 55, 0.35)',
                    strokeWidth: 1,
                    stroke: '#FFBD37',
                    widgets: {},
                },
                primary: null,
            });
            if (!shapeId) {
                return;
            }

            this._selectionShapeInfo = {
                ...activeComment,
                shapeId,
            };
        }));
    }
}
