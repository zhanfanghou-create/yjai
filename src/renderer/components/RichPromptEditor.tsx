import React, { useRef, useState, useCallback, useEffect } from 'react';
import './RichPromptEditor.css';

// ==================== 类型定义 ====================
export type RichSegment = { type: 'text' | 'ref' | 'dur' | 'line'; value: string };

export interface RichReferenceItem {
  name: string;
  url?: string;
  kind?: 'image' | 'video' | 'audio';
  thumbnail?: string;
}

interface RichPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** 可 @ 引用的名称列表 */
  referenceNames?: string[];
  /** 参考图/视频/音频列表，用于 @ 引用弹窗展示缩略图 */
  references?: RichReferenceItem[];
  /** 是否启用时长 token 解析（如 3s、3秒） */
  enableDuration?: boolean;
  /** 是否启用台词 token 解析（如 {台词}） */
  enableLine?: boolean;
  rows?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
}

// ==================== 富文本解析函数 ====================
export function parseRichPrompt(text: string, opts?: { enableDuration?: boolean; enableLine?: boolean }): RichSegment[] {
  const enableDuration = opts?.enableDuration !== false;
  const enableLine = opts?.enableLine !== false;
  const out: RichSegment[] = [];

  // 构建正则：<引用> | 时长(3s/3秒/几秒) | {台词}
  let pattern = '<([^<>]+)>';
  if (enableDuration) pattern += '|((?:\\d+(?:\\.\\d+)?)\\s*(?:s\\b|秒)|几秒)';
  if (enableLine) pattern += '|(\\{[^}]*\\})';
  const re = new RegExp(pattern, 'g');

  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ''))) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    if (m[1]) {
      out.push({ type: 'ref', value: m[1].trim() });
    } else if (enableDuration && m[2]) {
      const v = m[2].trim();
      // 4 位及以上数字（如 1990s）是年代/年份，不是时长标签
      const num = parseFloat(v);
      if (Number.isFinite(num) && num >= 1000) {
        out.push({ type: 'text', value: v });
      } else {
        out.push({ type: 'dur', value: v });
      }
    } else if (enableLine && m[3]) {
      out.push({ type: 'line', value: m[3] });
    }
    last = re.lastIndex;
  }
  if (last < (text || '').length) out.push({ type: 'text', value: (text || '').slice(last) });
  return out;
}

// ==================== 光标工具函数 ====================
// 计算单个节点的文本长度（用于 saveCaretOffset）
function calcNodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || '').length;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === 'BR') return 1;
    if (el.classList && el.classList.contains('rpe-ref')) {
      const refName = el.getAttribute('data-ref') || el.textContent || '';
      return refName.length + 2;
    }
    if (el.classList && el.classList.contains('rpe-dur')) {
      const dur = el.getAttribute('data-dur') || el.textContent?.replace('⏱ ', '') || '';
      return dur.length;
    }
    if (el.classList && el.classList.contains('rpe-line')) {
      const line = el.getAttribute('data-line') || el.textContent || '';
      return line.length;
    }
    let len = 0;
    for (let i = 0; i < el.childNodes.length; i++) {
      len += calcNodeTextLength(el.childNodes[i]);
    }
    return len;
  }
  return 0;
}

function saveCaretOffset(container: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return -1;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer)) return -1;
  // 使用和 safeExtractText 相同的逻辑计算光标位置
  let offset = 0;
  const walk = (node: Node): boolean => {
    if (node === range.startContainer) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += range.startOffset;
      } else {
        // 光标在元素节点内，计算子节点到 startOffset 的文本长度
        for (let i = 0; i < range.startOffset && i < node.childNodes.length; i++) {
          offset += calcNodeTextLength(node.childNodes[i]);
        }
      }
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node.textContent || '').length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName;
      if (tag === 'BR') {
        offset += 1; // 换行符
      } else if (el.classList && el.classList.contains('rpe-ref')) {
        const refName = el.getAttribute('data-ref') || el.textContent || '';
        offset += refName.length + 2; // <引用名>
      } else if (el.classList && el.classList.contains('rpe-dur')) {
        const dur = el.getAttribute('data-dur') || el.textContent?.replace('⏱ ', '') || '';
        offset += dur.length;
      } else if (el.classList && el.classList.contains('rpe-line')) {
        const line = el.getAttribute('data-line') || el.textContent || '';
        offset += line.length;
      } else {
        for (let i = 0; i < el.childNodes.length; i++) {
          if (walk(el.childNodes[i])) return true;
        }
      }
    }
    return false;
  };
  for (let i = 0; i < container.childNodes.length; i++) {
    if (walk(container.childNodes[i])) break;
  }
  return offset;
}

function restoreCaretOffset(container: HTMLElement, offset: number) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  let found = false;

  const walk = (node: Node): boolean => {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || '').length;
      if (remaining <= len) {
        range.setStart(node, Math.max(0, remaining));
        range.collapse(true);
        found = true;
        return true;
      }
      remaining -= len;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName;
      if (tag === 'BR') {
        if (remaining <= 1) {
          range.setStartAfter(el);
          range.collapse(true);
          found = true;
          return true;
        }
        remaining -= 1;
      } else if (el.classList && el.classList.contains('rpe-ref')) {
        const refName = el.getAttribute('data-ref') || el.textContent || '';
        const len = refName.length + 2;
        if (remaining <= len) {
          range.setStartAfter(el);
          range.collapse(true);
          found = true;
          return true;
        }
        remaining -= len;
      } else if (el.classList && el.classList.contains('rpe-dur')) {
        const dur = el.getAttribute('data-dur') || el.textContent?.replace('⏱ ', '') || '';
        const len = dur.length;
        if (remaining <= len) {
          range.setStartAfter(el);
          range.collapse(true);
          found = true;
          return true;
        }
        remaining -= len;
      } else if (el.classList && el.classList.contains('rpe-line')) {
        const line = el.getAttribute('data-line') || el.textContent || '';
        const len = line.length;
        if (remaining <= len) {
          range.setStartAfter(el);
          range.collapse(true);
          found = true;
          return true;
        }
        remaining -= len;
      } else {
        for (let i = 0; i < el.childNodes.length; i++) {
          if (walk(el.childNodes[i])) return true;
        }
      }
    }
    return false;
  };

  walk(container);
  if (!found) {
    range.selectNodeContents(container);
    range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}

// ==================== 主组件 ====================
export const RichPromptEditor: React.FC<RichPromptEditorProps> = ({
  value,
  onChange,
  placeholder = '输入提示词，使用 @ 引用参考资料...',
  className = '',
  referenceNames = [],
  references = [],
  enableDuration = true,
  enableLine = true,
  rows = 3,
  onKeyDown,
  onPointerDown,
  onMouseDown,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<number>(-1);
  const [refPickOpen, setRefPickOpen] = useState(false);
  const [editDur, setEditDur] = useState<{ raw: string } | null>(null);
  const [editLine, setEditLine] = useState<{ raw: string } | null>(null);
  const [refReplace, setRefReplace] = useState<{ raw: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // 富文本编辑器状态：避免 React 重新渲染 contentEditable 导致内容追加
  const valueFromUserInputRef = useRef(false);
  const lastDomTextRef = useRef('');
  const initializedRef = useRef(false);

  // 合并所有可引用名称
  const allRefNames = Array.from(new Set([
    ...referenceNames,
    ...references.map(r => r.name),
  ])).filter(Boolean);

  const filteredRefs = searchQuery.trim()
    ? allRefNames.filter(n => n.toLowerCase().includes(searchQuery.toLowerCase()))
    : allRefNames;

  // 查找引用的缩略图
  const findRefThumb = (name: string): RichReferenceItem | undefined => {
    return references.find(r => r.name === name)
      || references.find(r => name.includes(r.name) || r.name.includes(name));
  };

  // 安全地从 contenteditable DOM 提取纯文本（保留换行符和特殊标记）
  const safeExtractText = useCallback((root: HTMLElement): string => {
    try {
      let text = '';
      const walk = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const tag = el.tagName;
          if (tag === 'BR') {
            text += '\n';
          } else if (el.classList && el.classList.contains('rpe-ref')) {
            // 从 data-ref 属性提取引用名称，加回尖括号
            const refName = el.getAttribute('data-ref') || el.textContent || '';
            text += '<' + refName + '>';
          } else if (el.classList && el.classList.contains('rpe-dur')) {
            const dur = el.getAttribute('data-dur') || el.textContent?.replace('⏱ ', '') || '';
            text += dur;
          } else if (el.classList && el.classList.contains('rpe-line')) {
            const line = el.getAttribute('data-line') || el.textContent || '';
            text += line;
          } else if (tag === 'DIV' || tag === 'P') {
            if (text.length > 0 && !text.endsWith('\n')) text += '\n';
            el.childNodes.forEach(walk);
          } else {
            el.childNodes.forEach(walk);
          }
        }
      };
      root.childNodes.forEach(walk);
      return text;
    } catch (e) {
      return root.textContent || '';
    }
  }, []);

  // 将富文本解析结果转换为 HTML 字符串
  const renderRichHTML = useCallback((text: string): string => {
    const segs = parseRichPrompt(text, { enableDuration, enableLine });
    let html = '';
    for (const seg of segs) {
      if (seg.type === 'ref') {
        const found = findRefThumb(seg.value);
        const imgHtml = found?.thumbnail || found?.url ? `<img src="${found.thumbnail || found.url}" alt="" />` : '<span class="rpe-at">@</span>';
        const safeName = seg.value.replace(/"/g, '&quot;');
        html += `<span class="rpe-ref" contenteditable="false" data-ref="${safeName}">${imgHtml}${seg.value}</span>`;
      } else if (seg.type === 'dur') {
        const safeVal = seg.value.replace(/"/g, '&quot;');
        html += `<span class="rpe-dur" contenteditable="false" data-dur="${safeVal}">⏱ ${seg.value}</span>`;
      } else if (seg.type === 'line') {
        const safeVal = seg.value.replace(/"/g, '&quot;');
        html += `<span class="rpe-line" contenteditable="false" data-line="${safeVal}">${seg.value}</span>`;
      } else {
        const escaped = seg.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        html += escaped;
      }
    }
    return html;
  }, [references, enableDuration, enableLine]);

  // 替换提示词中的文本
  const replaceInPrompt = useCallback((oldText: string, newText: string) => {
    const next = value.replace(oldText, newText);
    onChange(next);
  }, [value, onChange]);

  // 在光标位置插入引用 token
  const insertRefToken = useCallback((token: string) => {
    const editor = editorRef.current;
    if (!editor) {
      onChange(value + token);
      return;
    }
    editor.focus();
    // 获取光标位置
    let caret = saveCaretOffset(editor);
    if (caret < 0) caret = safeExtractText(editor).length;
    const currentText = safeExtractText(editor);
    // 在光标位置插入引用文本
    const newText = currentText.slice(0, caret) + token + currentText.slice(caret);
    // 直接更新 DOM，确保胶囊效果立即可见
    const html = renderRichHTML(newText);
    editor.innerHTML = html;
    // 更新状态（标记为用户输入，useEffect 不重复更新 DOM）
    lastDomTextRef.current = newText;
    valueFromUserInputRef.current = true;
    onChange(newText);
    // 恢复光标位置到插入的引用之后
    const newCaret = caret + token.length;
    requestAnimationFrame(() => {
      if (editorRef.current) {
        restoreCaretOffset(editorRef.current, newCaret);
        editorRef.current.focus();
      }
    });
  }, [value, onChange, safeExtractText, renderRichHTML]);

  // 打开引用选择弹窗
  const openRefPicker = useCallback(() => {
    const editor = editorRef.current;
    if (editor) caretRef.current = saveCaretOffset(editor);
    setSearchQuery('');
    setRefPickOpen(true);
  }, []);

  // 输入处理：保存光标，同步内容，恢复光标
  const handleInput = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const caret = saveCaretOffset(editor);
    const scrollTop = editor.scrollTop;
    const scrollLeft = editor.scrollLeft;
    // 使用 safeExtractText 获取文本，保留换行符和特殊标记
    const text = safeExtractText(editor);
    if (text !== value) {
      // 标记这次 value 变化由用户输入导致，useEffect 中不更新 DOM
      valueFromUserInputRef.current = true;
      lastDomTextRef.current = text;
      onChange(text);
    }
    if (caret >= 0) {
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.scrollTop = scrollTop;
          editorRef.current.scrollLeft = scrollLeft;
          restoreCaretOffset(editorRef.current, caret);
        }
      });
    }
  }, [value, onChange, safeExtractText]);

  // 键盘处理：@ 键触发引用弹窗
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === '@' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openRefPicker();
      return;
    }
    onKeyDown?.(e);
  }, [openRefPicker, onKeyDown]);

  // 外部 value 变化时同步到编辑器（使用 innerHTML 手动管理，避免 React 重新渲染导致内容追加）
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const newValue = value || '';

    // 首次挂载：设置初始内容
    if (!initializedRef.current) {
      initializedRef.current = true;
      const html = renderRichHTML(newValue);
      if (editor.innerHTML !== html) editor.innerHTML = html;
      lastDomTextRef.current = newValue;
      return;
    }

    // 用户输入导致的 value 变化：不更新 DOM，只更新记录
    if (valueFromUserInputRef.current) {
      valueFromUserInputRef.current = false;
      lastDomTextRef.current = newValue;
      return;
    }

    // 外部 value 与当前 DOM 文本相同：不更新
    if (newValue === lastDomTextRef.current) return;

    // 外部程序化变更：更新 DOM 并恢复光标和滚动位置
    lastDomTextRef.current = newValue;
    const html = renderRichHTML(newValue);
    if (editor.innerHTML !== html) {
      try {
        const caret = saveCaretOffset(editor);
        const scrollTop = editor.scrollTop;
        const scrollLeft = editor.scrollLeft;
        editor.innerHTML = html;
        editor.scrollTop = scrollTop;
        editor.scrollLeft = scrollLeft;
        if (caret >= 0) restoreCaretOffset(editor, caret);
      } catch (e) {
        // 静默失败
      }
    }
  }, [value, renderRichHTML]);

  // 渲染后恢复光标（用于 insertRefToken 等操作）
  useEffect(() => {
    if (caretRef.current >= 0 && editorRef.current) {
      const caret = caretRef.current;
      caretRef.current = -1;
      requestAnimationFrame(() => {
        if (editorRef.current) restoreCaretOffset(editorRef.current, caret);
      });
    }
  });

  const segments = parseRichPrompt(value, { enableDuration, enableLine });
  void segments; // 保留用于类型检查，实际渲染使用 renderRichHTML

  // 点击事件委托：处理引用、时长、台词的点击
  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const refEl = target.closest('.rpe-ref') as HTMLElement | null;
    const durEl = target.closest('.rpe-dur') as HTMLElement | null;
    const lineEl = target.closest('.rpe-line') as HTMLElement | null;
    if (refEl) {
      const value = refEl.getAttribute('data-ref') || refEl.textContent || '';
      setRefReplace({ raw: value });
    } else if (durEl) {
      const value = durEl.getAttribute('data-dur') || durEl.textContent?.replace('⏱ ', '') || '';
      setEditDur({ raw: value });
    } else if (lineEl) {
      const value = lineEl.getAttribute('data-line') || lineEl.textContent || '';
      setEditLine({ raw: value });
    }
  }, []);

  return (
    <div className={`rpe-wrap ${className}`} onPointerDown={onPointerDown} onMouseDown={onMouseDown}>
      <div
        className="rpe-editor"
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleEditorClick}
        data-placeholder={placeholder}
        style={{ minHeight: `${rows * 24 + 16}px` }}
        dangerouslySetInnerHTML={{ __html: '' }}
      />

      {/* @ 引用选择弹窗 */}
      {refPickOpen && (
        <div className="rpe-overlay" onClick={() => setRefPickOpen(false)}>
          <div className="rpe-modal rpe-picker" onClick={e => e.stopPropagation()}>
            <div className="rpe-modal-head">
              <span className="rpe-modal-title">插入 @ 引用</span>
              <button className="rpe-modal-close" onClick={() => setRefPickOpen(false)}>×</button>
            </div>
            <div className="rpe-modal-body">
              <div className="rpe-search">
                <input
                  type="text"
                  placeholder="搜索引用名称..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              {filteredRefs.length === 0 ? (
                <div className="rpe-empty">暂无可引用的参考资料</div>
              ) : (
                <div className="rpe-ref-grid">
                  {filteredRefs.map((name, idx) => {
                    const item = findRefThumb(name);
                    return (
                      <button
                        key={idx}
                        className="rpe-ref-card"
                        onClick={() => { insertRefToken('<' + name + '>'); setRefPickOpen(false); }}
                      >
                        {item?.thumbnail || item?.url ? (
                          <img src={item.thumbnail || item.url} alt="" />
                        ) : (
                          <span className="rpe-ref-ico">@</span>
                        )}
                        <span>{name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {enableLine && (
                <>
                  <div className="rpe-sec">快捷插入</div>
                  <button
                    className="rpe-action-btn"
                    onClick={() => { insertRefToken('{台词内容}'); setRefPickOpen(false); }}
                  >
                    插入台词
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 引用替换弹窗 */}
      {refReplace && (
        <div className="rpe-overlay" onClick={() => setRefReplace(null)}>
          <div className="rpe-modal rpe-picker" onClick={e => e.stopPropagation()}>
            <div className="rpe-modal-head">
              <span className="rpe-modal-title">替换引用</span>
              <button className="rpe-modal-close" onClick={() => setRefReplace(null)}>×</button>
            </div>
            <div className="rpe-modal-body">
              <div className="rpe-sec">当前引用</div>
              <div className="rpe-ref-grid">
                {(() => {
                  const cur = findRefThumb(refReplace.raw);
                  return cur ? (
                    <div className="rpe-ref-card current">
                      {cur.thumbnail || cur.url ? <img src={cur.thumbnail || cur.url} alt="" /> : <span className="rpe-ref-ico">@</span>}
                      <span>{refReplace.raw}</span>
                    </div>
                  ) : (
                    <span className="rpe-empty">{refReplace.raw}</span>
                  );
                })()}
              </div>
              <div className="rpe-sec">替换为</div>
              {allRefNames.length === 0 ? (
                <div className="rpe-empty">暂无可替换的参考资料</div>
              ) : (
                <div className="rpe-ref-grid">
                  {allRefNames.map((name, idx) => {
                    const item = findRefThumb(name);
                    return (
                      <button
                        key={idx}
                        className="rpe-ref-card"
                        onClick={() => { replaceInPrompt(refReplace.raw, name); setRefReplace(null); }}
                      >
                        {item?.thumbnail || item?.url ? (
                          <img src={item.thumbnail || item.url} alt="" />
                        ) : (
                          <span className="rpe-ref-ico">@</span>
                        )}
                        <span>{name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 时长编辑弹窗 */}
      {editDur && (
        <div className="rpe-overlay" onClick={() => setEditDur(null)}>
          <div className="rpe-modal rpe-mini" onClick={e => e.stopPropagation()}>
            <div className="rpe-modal-head">
              <span className="rpe-modal-title">更改时间</span>
            </div>
            <div className="rpe-modal-body">
              <input
                type="number"
                className="rpe-input"
                defaultValue={editDur.raw.replace(/[^\d.]/g, '')}
                id="rpe-dur-input"
                min={1}
              />
              <span className="rpe-unit">秒</span>
            </div>
            <div className="rpe-modal-foot">
              <button className="rpe-btn-cancel" onClick={() => setEditDur(null)}>取消</button>
              <button
                className="rpe-btn-ok"
                onClick={() => {
                  const el = document.getElementById('rpe-dur-input') as HTMLInputElement;
                  const v = el?.value ? el.value + 's' : editDur.raw;
                  replaceInPrompt(editDur.raw, v);
                  setEditDur(null);
                }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 台词编辑弹窗 */}
      {editLine && (
        <div className="rpe-overlay" onClick={() => setEditLine(null)}>
          <div className="rpe-modal rpe-mini" onClick={e => e.stopPropagation()}>
            <div className="rpe-modal-head">
              <span className="rpe-modal-title">台词内容</span>
            </div>
            <div className="rpe-modal-body">
              <textarea
                className="rpe-textarea"
                defaultValue={editDur ? '' : editLine.raw.replace(/[{}]/g, '')}
                id="rpe-line-input"
                rows={4}
              />
            </div>
            <div className="rpe-modal-foot">
              <button className="rpe-btn-cancel" onClick={() => setEditLine(null)}>取消</button>
              <button
                className="rpe-btn-ok"
                onClick={() => {
                  const el = document.getElementById('rpe-line-input') as HTMLTextAreaElement;
                  const v = el?.value ? '{' + el.value + '}' : editLine.raw;
                  replaceInPrompt(editLine.raw, v);
                  setEditLine(null);
                }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RichPromptEditor;
