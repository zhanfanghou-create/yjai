import React, { useMemo } from 'react';

/**
 * 轻量 Markdown 渲染器（纯字符串处理，零外部依赖）
 * 替代 react-markdown + remark-gfm + rehype-sanitize
 * 解决 Vite 预构建时 remark-gfm/remark-parse 版本冲突（modelist undefined）问题
 */
export const SafeMarkdown = React.memo(function SafeMarkdown({ content }: { content: string }) {
  const html = useMemo(() => {
    let h = content;
    // 转义 HTML 标签防止 XSS
    h = h.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // 代码块 ```...```
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:var(--bg-tertiary);padding:12px;border-radius:6px;overflow-x:auto;font-size:12px;color:var(--text-secondary)"><code>$2</code></pre>');
    // 行内代码 `...`
    h = h.replace(/`([^`]+)`/g, '<code style="background:var(--bg-tertiary);padding:2px 6px;border-radius:3px;font-size:12px">$1</code>');
    // 粗体 **...**
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 斜体 *...*
    h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // 标题
    h = h.replace(/^### (.+)$/gm, '<h3 style="font-size:15px;font-weight:600;margin:16px 0 8px">$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2 style="font-size:17px;font-weight:600;margin:20px 0 10px">$1</h2>');
    h = h.replace(/^# (.+)$/gm, '<h1 style="font-size:19px;font-weight:700;margin:24px 0 12px">$1</h1>');
    // 无序列表
    h = h.replace(/^[-*] (.+)$/gm, '<li style="margin-left:16px;margin-bottom:4px">$1</li>');
    // 有序列表
    h = h.replace(/^\d+\. (.+)$/gm, '<li style="margin-left:16px;margin-bottom:4px">$1</li>');
    // 分隔线
    h = h.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border-color);margin:16px 0" />');
    // 表格 |...| — 跳过分隔线, 相邻行合并为单一表格
    const tableRows: string[] = [];
    let inTable = false;
    let tableHtml = '';
    const lines = h.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const tableMatch = line.match(/^\|(.+)\|$/);
      if (tableMatch) {
        // 检查是否是分隔线 (只含 : - 空格 |)
        const inner = tableMatch[1];
        const isSep = /^[\s:-]+$/.test(inner.replace(/\|/g, ''));
        if (isSep) { if (inTable) { tableHtml += '</tbody></table>'; inTable = false; } continue; }

        const cells = line.split('|').filter(c => c.trim());
        if (cells.length < 2) { if (inTable) { tableHtml += '</tbody></table>'; inTable = false; } tableHtml += line + '\n'; continue; }

        if (!inTable) {
          inTable = true;
          tableHtml += '<table style="width:100%;border-collapse:collapse;margin:8px 0">';
          // 首行为表头
          tableHtml += '<thead><tr>' + cells.map(c => `<th style="border:1px solid var(--border-color);padding:6px 10px;background:var(--bg-tertiary);font-weight:600;text-align:left">${c.trim()}</th>`).join('') + '</tr></thead><tbody>';
        } else {
          tableHtml += '<tr>' + cells.map(c => `<td style="border:1px solid var(--border-color);padding:6px 10px">${c.trim()}</td>`).join('') + '</tr>';
        }
      } else {
        if (inTable) { tableHtml += '</tbody></table>'; inTable = false; }
        tableHtml += line + '\n';
      }
    }
    if (inTable) tableHtml += '</tbody></table>';
    h = tableHtml;
    // 段落（双换行）
    h = h.replace(/\n\n/g, '</p><p style="margin:8px 0;line-height:1.7">');
    // 单换行转 <br>
    h = h.replace(/\n/g, '<br/>');
    return `<div style="color:var(--text-primary);line-height:1.7;font-size:13px;padding:8px 4px">${h}</div>`;
  }, [content]);

  if (!content) return null;

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
});
