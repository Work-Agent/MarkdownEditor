import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';

export function editorTheme(dark: boolean) {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        color: 'var(--md-fg)',
        backgroundColor: 'var(--md-bg)',
      },
      '.cm-scroller': {
        fontFamily: 'var(--md-font)',
        lineHeight: '1.75',
        overflow: 'auto',
      },
      '.cm-content': {
        padding: '26px 0 160px',
        caretColor: 'var(--md-accent)',
      },
      '.cm-line': {
        padding: '0 6px',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--md-accent)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--md-selection)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--md-active-line)',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--md-bg)',
        color: 'var(--md-muted)',
        border: 'none',
        paddingRight: '8px',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--md-active-line)',
        color: 'var(--md-fg)',
      },
      '.cm-panels': {
        backgroundColor: 'var(--md-panel)',
        color: 'var(--md-fg)',
        borderColor: 'var(--md-border)',
      },
      '.cm-panels.cm-panels-top': {
        borderBottom: '1px solid var(--md-border)',
      },
      '.cm-searchMatch': {
        backgroundColor: 'var(--md-search-match)',
        outline: '1px solid var(--md-accent)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'var(--md-search-selected)',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--md-panel)',
        color: 'var(--md-fg)',
        border: '1px solid var(--md-border)',
        borderRadius: '8px',
        boxShadow: '0 8px 30px rgba(0,0,0,.18)',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--md-accent-soft)',
        color: 'var(--md-fg)',
      },
      '.cm-tooltip-autocomplete > ul > li': {
        padding: '3px 8px',
      },
      '.cm-tooltip-autocomplete .cm-completionDetail': {
        color: 'var(--md-muted)',
        fontStyle: 'normal',
        marginLeft: '12px',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--md-panel)',
        border: '1px solid var(--md-border)',
        color: 'var(--md-muted)',
      },
      '.cm-placeholder': {
        color: 'var(--md-muted)',
        fontStyle: 'normal',
      },
    },
    { dark },
  );
}

export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.strong, fontWeight: '650' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--md-link)' },
  { tag: tags.url, color: 'var(--md-muted)' },
  { tag: tags.monospace, color: 'var(--md-code-fg)' },
  { tag: tags.comment, color: 'var(--md-muted)' },
  { tag: tags.keyword, color: 'var(--md-code-keyword)' },
  { tag: tags.string, color: 'var(--md-code-string)' },
  { tag: tags.special(tags.string), color: 'var(--md-code-string)' },
  { tag: tags.number, color: 'var(--md-code-number)' },
  { tag: tags.bool, color: 'var(--md-code-number)' },
  { tag: tags.operator, color: 'var(--md-code-keyword)' },
  { tag: tags.propertyName, color: 'var(--md-code-property)' },
  { tag: tags.typeName, color: 'var(--md-code-type)' },
  { tag: tags.function(tags.variableName), color: 'var(--md-code-function)' },
  { tag: tags.variableName, color: 'var(--md-code-fg)' },
  { tag: tags.punctuation, color: 'var(--md-muted)' },
  { tag: tags.bracket, color: 'var(--md-muted)' },
  { tag: tags.invalid, color: 'var(--md-danger)' },
]);

export const highlightTheme = syntaxHighlighting(markdownHighlightStyle);
