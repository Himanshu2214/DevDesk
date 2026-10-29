// Rich text (Tiptap) for ticket descriptions and comments. Stored as HTML in the STRING fields;
// older plain-text values are converted on the fly. Everything shown is sanitised with DOMPurify.
import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import DOMPurify from 'dompurify';

const isHtml = (v: string) => /^\s*<(p|h[1-6]|ul|ol|pre|blockquote|div)[\s>]/i.test(v);
const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain text (older entries) → paragraphs */
export const toHtml = (v: string) => (!v ? '' : isHtml(v) ? v : v.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join(''));
const clean = (html: string) => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
const isEmpty = (e: Editor) => e.isEmpty || e.getText().trim() === '';

/** Read-only display */
export function RichView({ value }: { value: string }) {
  return <div className="rt rt-view" dangerouslySetInnerHTML={{ __html: clean(toHtml(value)) }} />;
}

interface EditorProps {
  value: string;
  placeholder: string;
  /** description: called on blur when the text changed */
  onSave?(html: string): void;
  /** comment: Ctrl+Enter or the button; the editor is cleared afterwards */
  onSubmit?(html: string): void;
  submitLabel?: string;
}

export function RichEditor({ value, placeholder, onSave, onSubmit, submitLabel = 'Comment' }: EditorProps) {
  const submitRef = useRef<() => void>(() => {});
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      TaskList, TaskItem.configure({ nested: true }),
    ],
    content: toHtml(value),
    editorProps: {
      attributes: { class: 'rt rt-edit' },
      handleKeyDown: (_view, e) => {
        if (onSubmit && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { submitRef.current(); return true }
        return false;
      },
    },
    onBlur: ({ editor: ed }) => {
      if (!onSave) return;
      const html = isEmpty(ed) ? '' : clean(ed.getHTML());
      if (html !== toHtml(value)) onSave(html);
    },
  });
  submitRef.current = () => {
    if (!editor || isEmpty(editor)) return;
    onSubmit?.(clean(editor.getHTML()));
    editor.commands.clearContent(true);
  };
  // take over changes from the server, but never while the user is typing
  useEffect(() => {
    if (editor && !editor.isFocused && toHtml(value) !== editor.getHTML() && !(value === '' && isEmpty(editor))) editor.commands.setContent(toHtml(value), false);
  }, [value, editor]);

  if (!editor) return null;
  const btn = (label: string, title: string, active: boolean, run: () => void) =>
    <button type="button" className={'rtb' + (active ? ' on' : '')} title={title} onMouseDown={e => { e.preventDefault(); run() }}>{label}</button>;
  return (
    <div className={'rt-box' + (onSubmit ? ' compose' : '')}>
      <div className="rt-bar">
        {btn('B', 'Bold (Ctrl+B)', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run())}
        {btn('I', 'Italic (Ctrl+I)', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run())}
        {btn('</>', 'Inline code (Ctrl+E)', editor.isActive('code'), () => editor.chain().focus().toggleCode().run())}
        {btn('H', 'Heading', editor.isActive('heading'), () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
        {btn('•', 'Bullet list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run())}
        {btn('1.', 'Numbered list', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run())}
        {btn('☑', 'Task list', editor.isActive('taskList'), () => editor.chain().focus().toggleTaskList().run())}
        {btn('{ }', 'Code block – for ABAP snippets', editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run())}
        {btn('🔗', 'Link', editor.isActive('link'), () => {
          const prev = editor.getAttributes('link').href as string | undefined;
          const url = prompt('Link URL', prev ?? 'https://');
          if (url === null) return;
          if (!url || url === 'https://') editor.chain().focus().unsetLink().run();
          else if (/^(https?:|mailto:)/i.test(url)) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        })}
        {onSubmit && <><span className="sp" /><span className="muted" style={{ fontSize: 11.5 }}><kbd>Ctrl</kbd> <kbd>Enter</kbd></span>
          <button type="button" className="btn" style={{ height: 26 }} onClick={() => submitRef.current()}>{submitLabel}</button></>}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
