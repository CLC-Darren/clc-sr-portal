/**
 * CLC SR｜名單匯出（PDF、JPG）
 * 在瀏覽器裡把名單畫成 A4 橫式頁面，不需要外部套件：
 *   - JPG：整份名單一張長圖（太長時自動分成幾張）
 *   - PDF：每頁一張 A4 橫式，可直接列印
 */
(function () {
  const SR = window.SR;
  const W = 1754, H = 1240;           // A4 橫式，約 150 dpi
  const M = 64;                        // 邊界
  const ROW = 46, HEAD = 150, THEAD = 50, FOOT = 60;
  const FONT = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif';
  const COLS = [
    { key: 'i', label: '#', w: 64, align: 'right' },
    { key: 'name', label: '姓名', w: 180, bold: true },
    { key: 'gender', label: '性別', w: 70 },
    { key: 'birth', label: '生日(民國)', w: 150 },
    { key: 'age', label: '年齡', w: 76, align: 'right' },
    { key: 'mobile', label: '手機', w: 190 },
    { key: 'phone', label: '市話', w: 190 },
    { key: 'group', label: '小組', w: 160 },
    { key: 'status', label: '狀態', w: 130 },
    { key: 'address', label: '地址', w: 0 }   // 其餘寬度
  ];
  const used = COLS.reduce((s, c) => s + c.w, 0);
  COLS[COLS.length - 1].w = W - M * 2 - used;

  function cells(p, i, groupMap, statusOf) {
    const g = groupMap[p.groupId];
    return {
      i: String(i + 1), name: p.name || '', gender: p.gender || '',
      birth: SR.formatRoc(p.birthday), age: p.birthday ? String(SR.age(p.birthday)) : '',
      mobile: p.mobile || '', phone: p.phone || '',
      group: g ? g.name : (p.category === '全職同工' ? '全職同工' : '未分組'),
      status: (statusOf || SR.statusOf)(p) || '', address: p.address || ''
    };
  }

  function fit(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    let t = text;
    while (t.length && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
    return t + '…';
  }

  function drawHeader(ctx, opts, y0, pageLabel) {
    ctx.fillStyle = '#1D1D1F';
    ctx.font = `800 40px ${FONT}`;
    ctx.fillText(opts.title, M, y0 + 58);
    ctx.font = `500 22px ${FONT}`;
    ctx.fillStyle = '#6E6E73';
    ctx.fillText(opts.subtitle, M, y0 + 100);
    if (pageLabel) { ctx.textAlign = 'right'; ctx.fillText(pageLabel, W - M, y0 + 100); ctx.textAlign = 'left'; }
    // 表頭
    const ty = y0 + HEAD - THEAD + 10;
    ctx.fillStyle = '#007E8A';
    ctx.fillRect(M, ty, W - M * 2, THEAD);
    ctx.fillStyle = '#fff';
    ctx.font = `700 22px ${FONT}`;
    let x = M;
    COLS.forEach(c => {
      ctx.textAlign = c.align === 'right' ? 'right' : 'left';
      ctx.fillText(c.label, c.align === 'right' ? x + c.w - 12 : x + 12, ty + 33);
      x += c.w;
    });
    ctx.textAlign = 'left';
    return ty + THEAD;
  }

  function drawRows(ctx, rows, startIdx, y, groupMap, statusOf) {
    rows.forEach((p, k) => {
      const i = startIdx + k;
      if (i % 2 === 1) { ctx.fillStyle = '#F5F5F7'; ctx.fillRect(M, y, W - M * 2, ROW); }
      const c = cells(p, i, groupMap, statusOf);
      let x = M;
      COLS.forEach(col => {
        ctx.font = `${col.bold ? 700 : 400} 22px ${FONT}`;
        ctx.fillStyle = col.key === 'i' ? '#8E8E93' : '#1D1D1F';
        const t = fit(ctx, c[col.key], col.w - 24);
        ctx.textAlign = col.align === 'right' ? 'right' : 'left';
        ctx.fillText(t, col.align === 'right' ? x + col.w - 12 : x + 12, y + 31);
        x += col.w;
      });
      ctx.textAlign = 'left';
      ctx.strokeStyle = '#E5E5EA'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(M, y + ROW - .5); ctx.lineTo(W - M, y + ROW - .5); ctx.stroke();
      y += ROW;
    });
    return y;
  }

  function newCanvas(h) {
    const c = document.createElement('canvas');
    c.width = W; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, h);
    ctx.textBaseline = 'alphabetic';
    return [c, ctx];
  }

  function pages(list, opts) {
    const per = Math.floor((H - HEAD - FOOT - 20) / ROW);
    const total = Math.max(1, Math.ceil(list.length / per));
    const out = [];
    for (let n = 0; n < total; n++) {
      const [c, ctx] = newCanvas(H);
      const y = drawHeader(ctx, opts, 0, `第 ${n + 1} / ${total} 頁`);
      drawRows(ctx, list.slice(n * per, (n + 1) * per), n * per, y, opts.groupMap, opts.statusOf);
      out.push(c);
    }
    return out;
  }

  function longImages(list, opts) {
    const maxRows = Math.floor((30000 - HEAD - FOOT) / ROW);  // 瀏覽器圖片高度上限
    const parts = Math.max(1, Math.ceil(list.length / maxRows));
    const out = [];
    for (let n = 0; n < parts; n++) {
      const rows = list.slice(n * maxRows, (n + 1) * maxRows);
      const [c, ctx] = newCanvas(HEAD + Math.max(rows.length, 1) * ROW + FOOT);
      const y = drawHeader(ctx, opts, 0, parts > 1 ? `第 ${n + 1} / ${parts} 張` : '');
      drawRows(ctx, rows, n * maxRows, y, opts.groupMap, opts.statusOf);
      out.push(c);
    }
    return out;
  }

  function dataUrlBytes(url) {
    const bin = atob(url.split(',')[1]);
    const b = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return b;
  }

  /** 最小的 PDF：每頁一張 JPEG 圖，A4 橫式 842×595 pt。 */
  function buildPdf(canvases) {
    const enc = new TextEncoder();
    const chunks = []; let len = 0; const offs = [];
    const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
    push('%PDF-1.4\n'); push(new Uint8Array([37, 226, 227, 207, 211, 10]));
    const n = canvases.length, PW = 842, PH = 595;
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${canvases.map((_, i) => `${3 + 3 * i} 0 R`).join(' ')}] >>`));
    canvases.forEach((c, i) => {
      const P = 3 + 3 * i, C = 4 + 3 * i, I = 5 + 3 * i;
      const img = dataUrlBytes(c.toDataURL('image/jpeg', 0.9));
      obj(P, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 ${I} 0 R >> >> /Contents ${C} 0 R >>`));
      const cs = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
      obj(C, () => { push(`<< /Length ${cs.length} >>\nstream\n`); push(cs); push('\nendstream'); });
      obj(I, () => { push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`); push(img); push('\nendstream'); });
    });
    const xref = len, total = 3 + 3 * n;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let k = 1; k < total; k++) x += String(offs[k]).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(chunks, { type: 'application/pdf' });
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  const toBlob = c => new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));

  /**
   * opts: { title, subtitle, fileBase, groupMap }
   * type: 'pdf' | 'jpg'
   */
  SR.exportList = async function (type, list, opts) {
    try { await document.fonts.ready; } catch (e) { /* 字型沒載完也照樣畫 */ }
    if (type === 'pdf') {
      download(buildPdf(pages(list, opts)), `${opts.fileBase}.pdf`);
    } else {
      const imgs = longImages(list, opts);
      for (let i = 0; i < imgs.length; i++) {
        download(await toBlob(imgs[i]), imgs.length > 1 ? `${opts.fileBase}-${i + 1}.jpg` : `${opts.fileBase}.jpg`);
      }
    }
  };
  SR._buildPdf = buildPdf; // 測試用
})();
