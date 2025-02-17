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

import type { ICommand, IMutationInfo, Workbook } from '@univerjs/core';
import {
    CommandType,
    ICommandService,
    IUndoRedoService,
    IUniverInstanceService,
    sequenceExecute,
    UniverInstanceType,
} from '@univerjs/core';
import type { IAccessor } from '@wendellhu/redi';

import { SheetsSelectionsService } from '../../services/selections/selection-manager.service';
import { SheetInterceptorService } from '../../services/sheet-interceptor/sheet-interceptor.service';
import type { ISetRangeValuesMutationParams } from '../mutations/set-range-values.mutation';
import { SetRangeValuesMutation, SetRangeValuesUndoMutationFactory } from '../mutations/set-range-values.mutation';
import { generateNullCell } from '../../basics/utils';

/**
 * The command to clear all in current selected ranges.
 */
export const ClearSelectionAllCommand: ICommand = {
    id: 'sheet.command.clear-selection-all',
    type: CommandType.COMMAND,
    handler: async (accessor: IAccessor) => {
        const univerInstanceService = accessor.get(IUniverInstanceService);
        const commandService = accessor.get(ICommandService);
        const selectionManagerService = accessor.get(SheetsSelectionsService);
        const undoRedoService = accessor.get(IUndoRedoService);
        const sheetInterceptorService = accessor.get(SheetInterceptorService);

        const workbook = univerInstanceService.getCurrentUnitForType<Workbook>(UniverInstanceType.UNIVER_SHEET);
        if (!workbook) return false;

        const unitId = workbook.getUnitId();
        const worksheet = workbook.getActiveSheet();
        if (!worksheet) return false;

        const subUnitId = worksheet.getSheetId();
        const selections = selectionManagerService.getCurrentSelections()?.map((s) => s.range);
        if (!selections?.length) {
            return false;
        }

        const sequenceExecuteList: IMutationInfo[] = [];
        const sequenceExecuteUndoList: IMutationInfo[] = [];

        // clear style and content
        const clearMutationParams: ISetRangeValuesMutationParams = {
            subUnitId,
            unitId,
            cellValue: generateNullCell(selections),
        };
        const undoClearMutationParams: ISetRangeValuesMutationParams = SetRangeValuesUndoMutationFactory(
            accessor,
            clearMutationParams
        );

        sequenceExecuteList.push({
            id: SetRangeValuesMutation.id,
            params: clearMutationParams,
        });
        sequenceExecuteUndoList.push({
            id: SetRangeValuesMutation.id,
            params: undoClearMutationParams,
        });

        const intercepted = sheetInterceptorService.onCommandExecute({ id: ClearSelectionAllCommand.id });

        sequenceExecuteList.push(...intercepted.redos);
        sequenceExecuteUndoList.unshift(...intercepted.undos);
        const result = sequenceExecute(sequenceExecuteList, commandService);

        if (result) {
            undoRedoService.pushUndoRedo({
                // If there are multiple mutations that form an encapsulated project, they must be encapsulated in the same undo redo element.
                // Hooks can be used to hook the code of external controllers to add new actions.
                unitID: unitId,
                undoMutations: sequenceExecuteUndoList,
                redoMutations: sequenceExecuteList,
            });

            return true;
        }

        return false;
    },
};

