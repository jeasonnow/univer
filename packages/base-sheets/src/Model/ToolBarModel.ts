import { BaseSelectChildrenProps, BaseSelectProps } from '../View/UI/Common/Select/Select';
import { BaseTextButtonProps } from '../View/UI/Common/TextButton/TextButton';

/**
 * TODO: 插件的要去除
 */
export interface IShowToolBarConfig {
    undoRedo?: boolean; // Undo redo
    paintFormat?: boolean; // Format brush
    currencyFormat?: boolean; // currency format
    percentageFormat?: boolean; // Percentage format
    numberDecrease?: boolean; // 'Decrease the number of decimal places'
    numberIncrease?: boolean; // 'Increase the number of decimal places
    moreFormats?: boolean; // 'More Formats'
    font?: boolean; // 'font'
    fontSize?: boolean; // 'Font size'
    bold?: boolean; // 'Bold (Ctrl+B)'
    italic?: boolean; // 'Italic (Ctrl+I)'
    strikethrough?: boolean; // 'Strikethrough (Alt+Shift+5)'
    underline?: boolean; // 'Underline (Alt+Shift+6)'
    textColor?: boolean; // 'Text color'
    fillColor?: boolean; // 'Cell color'
    border?: boolean; // 'border'
    mergeCell?: boolean; // 'Merge cells'
    horizontalAlignMode?: boolean; // 'Horizontal alignment'
    verticalAlignMode?: boolean; // 'Vertical alignment'
    textWrapMode?: boolean; // 'Wrap mode'
    textRotateMode?: boolean; // 'Text Rotation Mode'

    image?: boolean; // 'Insert picture'
    link?: boolean; // 'Insert link'
    chart?: boolean; // 'chart' (the icon is hidden, but if the chart plugin is configured, you can still create a new chart by right click)
    comment?: boolean; // 'comment'
    pivotTable?: boolean; // 'PivotTable'
    function?: boolean; // 'formula'
    frozenMode?: boolean; // 'freeze mode'
    sortAndFilter?: boolean; // 'Sort and filter'
    conditionalFormat?: boolean; // 'Conditional Format'
    dataValidation?: boolean; // 'Data Validation'
    splitColumn?: boolean; // 'Split column'
    screenshot?: boolean; // 'screenshot'
    findAndReplace?: boolean; // 'Find and Replace'
    protection?: boolean; // 'Worksheet protection'
    print?: boolean; // 'Print'
}

enum ToolbarType {
    SELECT,
    BUTTON,
}

// 继承基础下拉属性,添加国际化
export interface BaseToolBarSelectChildrenProps extends BaseSelectChildrenProps {
    locale?: string;
    suffixLocale?: string;
    children?: BaseToolBarSelectChildrenProps[];
}

interface BaseToolBarSelectProps extends BaseSelectProps {
    locale?: string;
    suffixLocale?: string;
    children?: BaseToolBarSelectChildrenProps[];
}

export interface IToolBarItemProps extends BaseToolBarSelectProps, BaseTextButtonProps {
    show?: boolean; //是否显示按钮
    toolbarType?: ToolbarType;
    locale?: string; //label国际化
    tooltipLocale?: string; //tooltip国际化
    tooltip?: string; //tooltip文字
    border?: boolean;
}

export class ToolBarModel {
    private _config: IShowToolBarConfig[];

    private _toolList: IToolBarItemProps[];

    get config(): IShowToolBarConfig[] {
        return this._config;
    }

    get toolList(): IToolBarItemProps[] {
        return this._toolList;
    }

    set config(value: IShowToolBarConfig[]) {
        this._config = value;
    }

    set toolList(value: IToolBarItemProps[]) {
        this._toolList = value;
    }
}
