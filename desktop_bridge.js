(() => {
  'use strict';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const download = (filename, content, type) => {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (window.exportFinished) window.exportFinished(type.includes('csv') ? 'csv' : 'ficheiro', true);
  };

  function promptText(title, text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => alert(title + '\n\nResumo copiado para a área de transferência.')).catch(() => fallbackCopy(title, text));
    } else fallbackCopy(title, text);
  }
  function fallbackCopy(title, text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); alert(title + '\n\nResumo copiado para a área de transferência.'); }
    catch (_) { download('resumo_registo_cais.txt', text, 'text/plain;charset=utf-8'); }
    ta.remove();
  }

  function voiceInput(target) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { if (window.voiceUnavailable) window.voiceUnavailable(); return; }
    const rec = new SR();
    rec.lang = 'pt-PT'; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : '';
      if (window.receiveVoice) window.receiveVoice(target, text);
    };
    rec.onerror = () => { if (window.voiceUnavailable) window.voiceUnavailable(); };
    try { rec.start(); } catch (_) { if (window.voiceUnavailable) window.voiceUnavailable(); }
  }

  function columnsFor(type) {
    if (type === 'viaturas') return {
      labels:['MATRÍCULA','NOME(S)','EMPRESA','DESTINO','DATA','HORA DE ENTRADA','HORA DE SAÍDA','Nº VIGILANTE','RUBRICA DO VIGILANTE'],
      widths:[82,120,104,118,65,75,75,65,82],
      vals:r=>[r.plate,r.persons,r.company,r.destination,r.entryDate,r.entryTime,r.exitTime||'',r.guardNumber||'',r.guardName||'']
    };
    if (type === 'pessoas') return {
      labels:['NOME(S)','EMPRESA','DESTINO / LOJA','MOTIVO / ATIVIDADE','DATA','HORA DE ENTRADA','HORA DE SAÍDA','AUTORIZAÇÃO','Nº VIGILANTE','RUBRICA DO VIGILANTE'],
      widths:[108,86,90,120,58,62,62,78,57,65],
      vals:r=>[r.names,r.company,r.destination,r.activity,r.entryDate,r.entryTime,r.exitTime||'',r.authorizationLabel||'',r.guardNumber||'',r.guardName||'']
    };
    return {
      labels:['NOME DO ESTAFETA','LOJA / DESTINO','DATA','HORA DE ENTRADA','HORA DE SAÍDA','Nº VIGILANTE','RUBRICA DO VIGILANTE'],
      widths:[144,188,76,88,88,84,118],
      vals:r=>[r.name,r.destination,r.entryDate,r.entryTime,r.exitTime||'',r.guardNumber||'',r.guardName||'']
    };
  }

  function titleFor(type) {
    if (type === 'viaturas') return 'REGISTO DE VIATURAS';
    if (type === 'pessoas') return 'REGISTO DE ENTRADA E SAÍDA DE PESSOAS';
    return 'REGISTO DE ESTAFETAS';
  }

  function pdfPrint(report) {
    const rowsPerPage = 18;
    const cfg = columnsFor(report.type || 'estafetas');
    const totalW = cfg.widths.reduce((a,b)=>a+b,0);
    const colgroup = cfg.widths.map(w=>`<col style="width:${(w/totalW*100).toFixed(3)}%">`).join('');
    const logoUrl = new URL('logo_strong_charon.svg', window.location.href).href;
    const records = Array.isArray(report.records) ? report.records : [];
    const pages = Math.max(1, Math.ceil(records.length / rowsPerPage));
    let sheets = '';
    for (let p=0; p<pages; p++) {
      const part = records.slice(p*rowsPerPage, (p+1)*rowsPerPage);
      let body = '';
      for (let i=0; i<rowsPerPage; i++) {
        const r = part[i];
        const vals = r ? cfg.vals(r) : new Array(cfg.labels.length).fill('');
        body += '<tr>' + vals.map((v,idx)=>`<td class="${idx >= cfg.labels.length-5 ? 'center' : ''}">${esc(v)}</td>`).join('') + '</tr>';
      }
      sheets += `
      <section class="sheet">
        <header class="form-head">
          <img class="form-logo" src="${logoUrl}" alt="Strong Charon">
          <h1>${esc(titleFor(report.type))}</h1>
          <div class="conf">DOCUMENTO<br>CONFIDENCIAL</div>
        </header>
        <div class="client"><b>CLIENTE:</b><span>${esc(report.client || 'Palácio do Gelo (Cais)')}</span></div>
        <div class="report-date">Data do relatório: ${esc(report.dateLabel || '')}</div>
        <table>
          <colgroup>${colgroup}</colgroup>
          <thead><tr>${cfg.labels.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead>
          <tbody>${body}</tbody>
        </table>
        <footer><span>Documento Confidencial. Acesso e uso restrito ao serviço da Strong Charon.<br>Registo Cais - modelo digital adaptado</span><span>Página ${p+1}</span></footer>
      </section>`;
    }
    const w = window.open('', '_blank');
    if (!w) { alert('O navegador bloqueou a janela de impressão. Permite pop-ups para este ficheiro e tenta novamente.'); return; }
    w.document.open();
    w.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${esc(titleFor(report.type))}</title>
    <style>
      @page{size:A4 landscape;margin:0}
      *{box-sizing:border-box}html,body{margin:0;padding:0;background:#e8edf3;font-family:Arial,Helvetica,sans-serif;color:#092442}
      .toolbar{position:fixed;top:12px;right:12px;z-index:20;background:#092442;color:white;padding:10px 16px;border-radius:10px;font-weight:700;cursor:pointer;border:0}
      .sheet{width:297mm;height:210mm;margin:10mm auto;background:#fff;padding:7mm 10mm 6mm;position:relative;page-break-after:always;box-shadow:0 4px 24px rgba(0,0,0,.15)}
      .sheet:last-child{page-break-after:auto}.form-head{height:22mm;display:grid;grid-template-columns:48mm 1fr 40mm;align-items:start;gap:5mm}
      .form-logo{width:42mm;height:17mm;object-fit:contain;object-position:left top}.form-head h1{margin:7mm 0 0;text-align:center;color:#0d53a5;font-size:17pt;line-height:1}.conf{border:1.3px solid #0d53a5;text-align:center;font-size:9pt;font-weight:800;line-height:1.25;padding:3mm 1mm;margin-top:1mm;color:#092442}
      .client{display:flex;align-items:flex-end;gap:8mm;height:13mm;color:#0d53a5;font-size:8pt}.client span{color:#092442;font-size:11pt;border-bottom:1px solid #0d53a5;min-width:105mm;padding:0 1mm 1mm}.report-date{font-size:7pt;margin:0 0 2mm;color:#092442}
      table{width:100%;border-collapse:collapse;table-layout:fixed;border:1px solid #0d53a5}th,td{border:1px solid #0d53a5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}th{height:12mm;background:#f8fbff;color:#092442;font-size:6.4pt;font-weight:800;text-align:center;padding:1mm}td{height:7.4mm;font-size:7.2pt;padding:1mm 1.2mm;color:#092442}td.center{text-align:center}footer{position:absolute;left:10mm;right:10mm;bottom:5mm;display:flex;justify-content:space-between;align-items:flex-end;color:#0d53a5;font-size:6pt;line-height:1.35}
      @media print{html,body{background:#fff}.toolbar{display:none}.sheet{margin:0;box-shadow:none}}
    </style></head><body><button class="toolbar" onclick="window.print()">Imprimir / Guardar PDF</button>${sheets}<script>setTimeout(()=>window.print(),500)<\/script></body></html>`);
    w.document.close();
    if (window.exportFinished) window.exportFinished('pdf', true);
  }

  window.Android = {
    voiceInput,
    exportCsv(filename, csv) { download(filename || 'registo_cais.csv', '\uFEFF' + String(csv || ''), 'text/csv;charset=utf-8'); },
    exportPdf(filename, reportJson) {
      try { pdfPrint(JSON.parse(reportJson || '{}')); }
      catch (e) { alert('Erro ao preparar PDF: ' + e.message); if (window.exportFinished) window.exportFinished('pdf', false); }
    },
    shareText(text) { promptText('Registo Cais', String(text || '')); },
    deviceId() { return 'PC_LOCAL'; }
  };
})();
