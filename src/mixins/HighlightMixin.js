import { types, getRoot } from "mobx-state-tree";

import Utils from "../utils";
import { guidGenerator } from "../utils/unique";
import Constants from "../core/Constants";

export const HighlightMixin = types
  .model()
  .views(self => ({}))
  .actions(self => ({
    /**
     * Create highlights from the stored `Range`
     */
    applyHighlight() {
      // Avoid calling this method twice
      if (self._spans) return;

      const range = self._getRange();
      // Avoid rendering before view is ready
      if (!range) return;

      const labelColor = self.getLabelColor();
      const identifier = guidGenerator(5);
      const stylesheet = createSpanStylesheet(identifier, labelColor);

      self._stylesheet = stylesheet;
      self._spans = Utils.Selection.highlightRange(range, {
        classNames: ["htx-highlight", stylesheet.className],
        label: self.getLabels(),
      });

      return self._spans;
    },

    /**
     * Removes current highlights
     */
    removeHighlight() {
      Utils.Selection.removeRange(self._spans);
    },

    /**
     * Update region's appearance if the label was changed
     */
    updateAppearenceFromState() {
      if (!self._spans) return;

      const lastSpan = self._spans[self._spans.length - 1];

      self._stylesheet.setColor(self.getLabelColor());
      Utils.Selection.applySpanStyles(lastSpan, { label: self.getLabels() });
    },

    /**
     * Make current region selected
     */
    selectRegion() {
      self.selected = true;
      self.completion.setHighlightedNode(self);
      self.completion.loadRegionState(self);

      self.addClass(self._stylesheet.state.active);

      const first = self._spans[0];

      if (first) return;

      if (first.scrollIntoViewIfNeeded) {
        first.scrollIntoViewIfNeeded();
      } else {
        first.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    },

    /**
     * Unselect text region
     */
    afterUnselectRegion() {
      self.removeClass(self._stylesheet?.state.active);
    },

    /**
     * Remove stylesheet before removing the highlight itself
     */
    beforeDestroy() {
      self._stylesheet.remove();
    },

    /**
     * Set cursor style of the region
     * @param {import("prettier").CursorOptions} cursor
     */
    setCursor(cursor) {
      self._stylesheet.setCursor(cursor);
    },

    /**
     * Draw region outline
     * @param {boolean} val
     */
    setHighlight(val) {
      if (!self._stylesheet) return;

      self.highlighted = val;

      if (self.highlighted) {
        self.addClass(self._stylesheet.state.highlighted);
        self._stylesheet.setCursor(Constants.RELATION_MODE_CURSOR);
      } else {
        self.removeClass(self._stylesheet.state.highlighted);
        self._stylesheet.setCursor(Constants.POINTER_CURSOR);
      }
    },

    getLabels() {
      const settings = getRoot(self).settings;
      if (!self.parent.showlabels && !settings.showLabels) return null;

      return Utils.Checkers.flatten(
        self.states.filter(s => s._type && s._type.indexOf("labels") !== -1).map(s => s.selectedValues()),
      );
    },

    getLabelColor() {
      let labelColor = self.parent.highlightcolor;

      if (!labelColor) {
        const ls = self.states.find(s => s._type && s._type.indexOf("labels") !== -1);
        if (ls) labelColor = ls.getSelectedColor();
      }

      if (labelColor) {
        labelColor = Utils.Colors.convertToRGBA(labelColor, 0.3);
      }

      return labelColor;
    },

    find(span) {
      return self._spans && self._spans.indexOf(span) >= 0 ? self : undefined;
    },

    /**
     * Add classes to all spans
     * @param {string[]} classNames
     */
    addClass(classNames) {
      if (!classNames || !self._spans) return;
      const classList = [].concat(classNames); // convert any input to array
      self._spans.forEach(span => span.classList.add(...classList));
    },

    /**
     * Remove classes from all spans
     * @param {string[]} classNames
     */
    removeClass(classNames) {
      if (!classNames || !self._spans) return;
      const classList = [].concat(classNames); // convert any input to array
      self._spans.forEach(span => span.classList.remove(...classList));
    },
  }));

/**
 * Creates a separate stylesheet for every region
 * @param {string} identifier GUID identifier of a region
 * @param {string} color Default label color
 */
const createSpanStylesheet = (identifier, color) => {
  const className = `.htx-highlight-${identifier}`;
  const variables = {
    color: `--background-color-${identifier}`,
    cursor: `--cursor-style-${identifier}`,
  };

  const stateClass = {
    active: "__active",
    highlighted: "__highlighted",
    collapsed: "__collapsed",
  };

  const classNames = {
    active: `${className}.${stateClass.active}`,
    highlighted: `${className}.${stateClass.highlighted}`,
  };

  const activeColorOpacity = 0.8;
  const toActiveColor = color => Utils.Colors.rgbaChangeAlpha(color, activeColorOpacity);

  const initialActiveColor = toActiveColor(color);

  document.documentElement.style.setProperty(variables.color, color);

  const rules = {
    [className]: `
      background-color: var(${variables.color});
      cursor: var(${variables.cursor}, pointer);
    `,
    [`${className}[data-label]::after`]: `
      padding: 2px 2px;
      font-size: 9.5px;
      font-weight: bold;
      font-family: Monaco;
      vertical-align: super;
      content: attr(data-label);
    `,
    [classNames.active]: `
      color: ${Utils.Colors.contrastColor(initialActiveColor)};
      ${variables.color}: ${initialActiveColor}
    `,
    [classNames.highlighted]: `
      position: relative;
    `,
    [`${classNames.highlighted}::before`]: `
      top: -1px;
      left: -1px;
      right: -1px;
      bottom: -1px;
      content: '';
      position: absolute;
      pointer-events: none;
      box-sizing: border-box;
      border: 1px dashed rgb(0, 174, 255);
    `,
    [`${classNames.highlighted}.${stateClass.collapsed}::before`]: `
      border-right: none;
    `,
    [`${classNames.highlighted} + ${classNames.highlighted}::before`]: `
      border-left: none;
    `,
  };

  const styleTag = document.createElement("style");
  styleTag.type = "text/css";
  styleTag.id = `highlight-${identifier}`;
  document.head.appendChild(styleTag);

  const stylesheet = styleTag.sheet ?? styleTag.styleSheet;
  const supportInserion = !!stylesheet.insertRule;
  let lastRuleIndex = 0;

  for (let ruleName in rules) {
    if (!rules.hasOwnProperty(ruleName)) continue;
    if (supportInserion) stylesheet.insertRule(`${ruleName} { ${rules[ruleName]} } `, lastRuleIndex++);
    else stylesheet.addRule(ruleName, rules);
  }

  /**
   * Set region color
   * @param {string} color
   */
  const setColor = color => {
    const newActiveColor = toActiveColor(color);
    const { style } = stylesheet.rules[2];
    document.documentElement.style.setProperty(variables.color, color);

    style.backgroundColor = newActiveColor;
    style.color = Utils.Colors.contrastColor(newActiveColor);
  };

  /**
   * Ser cursor style
   * @param {import("prettier").CursorOptions} cursor
   */
  const setCursor = cursor => {
    document.documentElement.style.setProperty(variables.cursor, cursor);
  };

  /**
   * Remove stylesheet
   */
  const remove = () => {
    styleTag.remove();
  };

  return {
    className: className.split(".").filter(el => !!el),
    state: stateClass,
    setColor,
    setCursor,
    remove,
  };
};