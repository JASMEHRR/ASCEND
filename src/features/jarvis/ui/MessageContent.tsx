import { Fragment, type ReactNode } from 'react';

/**
 * Compact markdown renderer for Jarvis replies — supports paragraphs, bullet and
 * numbered lists, fenced code blocks, and pipe tables, plus inline **bold**,
 * *italic*, and `code`. Deliberately dependency-free to keep the panel chunk tiny.
 */
export default function MessageContent({ text }: { text: string }) {
  return <div className="space-y-2">{renderBlocks(text)}</div>;
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++]);
      i++; // closing fence
      blocks.push(
        <pre key={key++} className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 text-[12px] leading-relaxed text-white/85">
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // Pipe table (header row + separator row of dashes)
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const rows: string[] = [];
      const header = line;
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(lines[i++]);
      blocks.push(renderTable(header, rows, key++));
      continue;
    }

    // Lists (bullet or numbered) — consecutive matching lines
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\.\s+/.test(line);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      const ListTag = ordered ? 'ol' : 'ul';
      blocks.push(
        <ListTag key={key++} className={`${ordered ? 'list-decimal' : 'list-disc'} space-y-0.5 pl-5 text-white/85`}>
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph — gather consecutive plain lines
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('```') && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push(
      <p key={key++} className="leading-relaxed text-white/90">
        {para.map((p, idx) => (
          <Fragment key={idx}>
            {renderInline(p)}
            {idx < para.length - 1 && <br />}
          </Fragment>
        ))}
      </p>,
    );
  }

  return blocks;
}

function renderTable(header: string, rows: string[], key: number): ReactNode {
  const cells = (row: string) =>
    row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
  const heads = cells(header);
  return (
    <div key={key} className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            {heads.map((h, idx) => (
              <th key={idx} className="border-b border-white/15 px-2 py-1.5 text-left font-bold text-white/70">
                {renderInline(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {cells(r).map((c, ci) => (
                <td key={ci} className="border-b border-white/5 px-2 py-1.5 text-white/85">
                  {renderInline(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = regex.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={key++} className="font-bold text-white">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={key++} className="rounded bg-white/10 px-1 py-0.5 text-[12px] text-brand-300">{tok.slice(1, -1)}</code>);
    else out.push(<em key={key++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
