/**
 * Discord birebir mesaj önizlemesi — Copy Editor paneli.
 * Custom emoji: <:name:id> ve <a:name:id> → CDN img
 */
(function (global) {
  const EMOJI_RE = /<(a)?:(\w+):(\d+)>/g;

  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function emojiUrl(animated, id) {
    const ext = animated ? 'gif' : 'png';
    return `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48&quality=lossless`;
  }

  /** Önce emoji → img, sonra kalan metni escape et (tersi emoji'yi bozar). */
  function renderEmojis(text) {
    const parts = [];
    let last = 0;
    const re = new RegExp(EMOJI_RE.source, 'g');
    let m;
    while ((m = re.exec(text)) !== null) {
      parts.push(escHtml(text.slice(last, m.index)));
      const url = emojiUrl(Boolean(m[1]), m[3]);
      const name = m[2];
      parts.push(
        `<img class="d-emoji" src="${url}" alt="${escHtml(name)}" title="${escHtml(name)}" loading="lazy" />`,
      );
      last = m.index + m[0].length;
    }
    parts.push(escHtml(text.slice(last)));
    return parts.join('');
  }

  /** Discord markdown — iç içe kalın/italik, başlık, alıntı, kod */
  function renderMarkdown(text) {
    if (!text) return '';
    let s = renderEmojis(text);

    // ```code blocks```
    s = s.replace(/```([\s\S]*?)```/g, (_, code) =>
      `<pre class="d-codeblock"><code>${code.trim()}</code></pre>`);

    // `inline code`
    s = s.replace(/`([^`\n]+)`/g, '<code class="d-code">$1</code>');

    // ### headers
    s = s.replace(/^### (.+)$/gm, '<div class="d-h3">$1</div>');

    // **bold**
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // *italic* (simple — after bold)
    s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');

    // > blockquote lines
    s = s.replace(/^&gt; (.+)$/gm, '<div class="d-quote">$1</div>');

    // ┃ pipe lines (result theme)
    s = s.replace(/^┃ (.+)$/gm, '<div class="d-pipe">┃ $1</div>');

    // newlines
    s = s.replace(/\n/g, '<br />');
    return s;
  }

  function colorHex(n) {
    if (n == null) return '#5865f2';
    const hex = (n >>> 0).toString(16).padStart(6, '0');
    return `#${hex.slice(-6)}`;
  }

  function renderEmbed(embed) {
    const color = colorHex(embed.color);
    const parts = [];
    parts.push(`<div class="d-embed" style="--embed-color:${color}">`);
    parts.push('<div class="d-embed-bar"></div>');
    parts.push('<div class="d-embed-inner">');
    if (embed.title) {
      parts.push(`<div class="d-embed-title">${renderMarkdown(embed.title)}</div>`);
    }
    if (embed.description) {
      parts.push(`<div class="d-embed-desc">${renderMarkdown(embed.description)}</div>`);
    }
    if (embed.fields?.length) {
      parts.push('<div class="d-embed-fields">');
      for (const f of embed.fields) {
        const cls = f.inline ? 'd-field inline' : 'd-field';
        parts.push(`<div class="${cls}">`);
        parts.push(`<div class="d-field-name">${renderMarkdown(f.name)}</div>`);
        parts.push(`<div class="d-field-value">${renderMarkdown(f.value)}</div>`);
        parts.push('</div>');
      }
      parts.push('</div>');
    }
    if (embed.image?.url) {
      parts.push(`<img class="d-embed-image" src="${escHtml(embed.image.url)}" alt="" loading="lazy" />`);
    }
    if (embed.thumbnail?.url) {
      parts.push(`<img class="d-embed-thumb" src="${escHtml(embed.thumbnail.url)}" alt="" loading="lazy" />`);
    }
    if (embed.footer?.text) {
      parts.push(`<div class="d-embed-footer">${renderMarkdown(embed.footer.text)}</div>`);
    }
    parts.push('</div></div>');
    return parts.join('');
  }

  const BTN_CLASS = {
    primary: 'd-btn primary',
    secondary: 'd-btn secondary',
    success: 'd-btn success',
    danger: 'd-btn danger',
    link: 'd-btn link',
  };

  function renderComponents(rows) {
    if (!rows?.length) return '';
    return rows.map((row) => {
      const btns = row.map((b) => {
        const cls = BTN_CLASS[b.style] ?? BTN_CLASS.secondary;
        const dis = b.disabled ? ' disabled' : '';
        return `<button type="button" class="${cls}"${dis}>${escHtml(b.label)}</button>`;
      }).join('');
      return `<div class="d-action-row">${btns}</div>`;
    }).join('');
  }

  function renderAttachments(items) {
    if (!items?.length) return '';
    return items.map((a) =>
      `<div class="d-attachment"><img src="${escHtml(a.url)}" alt="${escHtml(a.alt ?? a.filename ?? 'ek')}" class="d-attachment-img" loading="lazy" /></div>`,
    ).join('');
  }

  /**
   * @param {object} payload — previewPayload from API
   * @param {string} [overrideContent] — draft text for live preview
   */
  function renderDiscordPayload(payload, overrideContent) {
    if (!payload) return '';
    const parts = [];
    const content = overrideContent ?? payload.content;
    if (content) {
      parts.push(`<div class="d-content">${renderMarkdown(content)}</div>`);
    }
    if (payload.embeds?.length) {
      for (const e of payload.embeds) parts.push(renderEmbed(e));
    }
    if (payload.attachments?.length) {
      parts.push(renderAttachments(payload.attachments));
    }
    if (payload.components?.length) {
      parts.push(renderComponents(payload.components));
    }
    return parts.join('') || '<span class="d-empty">(boş mesaj)</span>';
  }

  /** Eski previewSample string → payload */
  function legacySampleToPayload(sample) {
    if (!sample) return { content: '' };
    const embedMatch = sample.match(/^\[Embed · #?([0-9a-fA-F]{6})\]\n([\s\S]*)$/);
    if (embedMatch) {
      const [, colorHex, rest] = embedMatch;
      const [title, ...desc] = rest.split('\n');
      return {
        embeds: [{
          title,
          description: desc.join('\n'),
          color: parseInt(colorHex, 16),
        }],
      };
    }
    return { content: sample.replace(/^\[OwlHunt-test\]\n/, '') };
  }

  global.DiscordPreview = {
    renderPayload: renderDiscordPayload,
    renderMarkdown,
    legacySampleToPayload,
  };
})(window);
