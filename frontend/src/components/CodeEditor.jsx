import React, { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { python } from '@codemirror/lang-python';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, defaultHighlightStyle, indentUnit } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';

export default function CodeEditor({ value, onChange, minHeight = '200px' }) {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: value || '',
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        python(),
        oneDark,
        syntaxHighlighting(defaultHighlightStyle),
        indentUnit.of('    '),
        keymap.of([...defaultKeymap, indentWithTab, ...searchKeymap]),
        updateListener,
        EditorView.theme({
          '&': {
            minHeight: minHeight,
            maxHeight: '500px',
            fontSize: '13px',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only create editor once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update content when value changes externally
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentVal = view.state.doc.toString();
    if (value !== currentVal && value !== undefined) {
      view.dispatch({
        changes: { from: 0, to: currentVal.length, insert: value || '' },
      });
    }
  }, [value]);

  return (
    <div className="border border-border rounded-sm overflow-hidden bg-[#0d0f17]">
      <div ref={containerRef} />
    </div>
  );
}
