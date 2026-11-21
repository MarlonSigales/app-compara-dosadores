/**
 * © 2026 Comparador de Dosadores — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Interface: cadastro dos dosadores e arquivos, papéis das partes do nome (pergunta lateral × longitudinal),
 * configuração e execução das análises, abas de resultados, editor das escalas de cor e relatório.
 */
'use strict';

const App = (() => {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const esc = Graficos.esc;
    const f1 = (v, d = 2) => Graficos.fmt(v, d);

    const novoEstado = () => ({
        versao: 1,
        projeto: { titulo: '', responsavel: '' },
        dosadores: [],
        padrao: { papeis: [], nomesOutros: {} },
        conducaoRotulos: {},
        analise: { resposta: 'A', transformacao: 'nenhuma', alfa: 0.05, arvores: 200, folds: 10, igualarRepeticoes: true, descartarPrimeiro: false, recorte: {}, limite: null, maxGrupos: 40, superficie: true, dml: true },
        escala: { preset: 'ryg90', paradas: Graficos.PRESETS.ryg90.paradas.map((p) => p.slice()), esticada: true },
        escalaDiv: { preset: 'vng', paradas: Graficos.PRESETS_DIV.vng.paradas.map((p) => p.slice()) }
    });
    let estado = novoEstado();
    let res = null;
    let abaAtual = { anova: 0, rf: 0, graf: 0 };
    let idSeq = 1;

    // ---------- armazenamento no navegador (IndexedDB) ----------
    const DB = 'comparador-dosadores';
    function abrirDB() {
        return new Promise((ok, falha) => {
            if (!('indexedDB' in window)) return falha(new Error('sem IndexedDB'));
            const r = indexedDB.open(DB, 1);
            r.onupgradeneeded = () => r.result.createObjectStore('projeto');
            r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error);
        });
    }
    let timerSalvar = null;
    function salvar() {
        clearTimeout(timerSalvar);
        timerSalvar = setTimeout(async () => {
            try { const db = await abrirDB(); db.transaction('projeto', 'readwrite').objectStore('projeto').put(JSON.parse(JSON.stringify(estado)), 'atual'); } catch (e) { /* armazenamento indisponível: segue só em memória */ }
        }, 500);
    }
    async function carregar() {
        try {
            const db = await abrirDB();
            const v = await new Promise((ok) => { const r = db.transaction('projeto').objectStore('projeto').get('atual'); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); });
            if (v && v.versao) estado = { ...novoEstado(), ...v, analise: { ...novoEstado().analise, ...v.analise } };
        } catch (e) { /* sem armazenamento */ }
        idSeq = Math.max(1, ...estado.dosadores.map((d) => d.id + 1));
    }

    function aviso(msg, ms = 3500) { const a = $('#aviso'); a.textContent = msg; a.classList.add('visivel'); clearTimeout(a._t); a._t = setTimeout(() => a.classList.remove('visivel'), ms); }
    function baixar(nome, conteudo, tipo) {
        const b = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = nome; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    function invalidar() { res = null; }

    // ---------- dosadores ----------
    function novoDosador(nome) {
        // a referência agronômica fica em branco de propósito: o usuário precisa informar
        return { id: idSeq++, nome: nome || `Dosador ${estado.dosadores.length + 1}`, marca: '', modelo: '', produto: 'sementes', semente: '', tipo: 'pneumatico', tubo: '', unidade: 'ms', xrefModo: 'populacao', xref: null, densidade: null, populacao: null, espacamento: null, dose: null, intervalo: 30, arquivos: [] };
    }
    async function lerArquivos(lista) {
        const out = [];
        for (const f of lista) {
            if (!/\.(csv|txt)$/i.test(f.name)) continue;
            const { reps } = Dados.lerCSV(await f.text());
            if (reps.length) out.push({ nome: f.name, reps });
        }
        return out;
    }
    /** Lê um ZIP: cada pasta com CSV vira um grupo (dosador). */
    async function lerZip(arquivo) {
        const zip = await JSZip.loadAsync(arquivo);
        const grupos = new Map();
        const entradas = Object.values(zip.files).filter((e) => !e.dir && /\.(csv|txt)$/i.test(e.name) && !e.name.includes('__MACOSX'));
        for (const e of entradas) {
            const partes = e.name.split('/');
            const pasta = partes.length > 1 ? partes[partes.length - 2] : '';
            const { reps } = Dados.lerCSV(await e.async('string'));
            if (!reps.length) continue;
            if (!grupos.has(pasta)) grupos.set(pasta, []);
            grupos.get(pasta).push({ nome: partes[partes.length - 1], reps });
        }
        return grupos;
    }
    async function importarZipGeral(arquivo, metadados = {}) {
        const grupos = await lerZip(arquivo);
        if (!grupos.size) { aviso('O ZIP não tem arquivos CSV.'); return; }
        for (const [pasta, arqs] of grupos) {
            const nome = pasta || arquivo.name.replace(/\.zip$/i, '');
            let d = estado.dosadores.find((x) => x.nome === nome);
            if (!d) { d = { ...novoDosador(nome), ...(metadados[nome] || {}) }; estado.dosadores.push(d); }
            d.arquivos = mesclar(d.arquivos, arqs);
        }
        invalidar(); salvar(); render();
        aviso(`${grupos.size} dosador(es) com ${[...grupos.values()].reduce((s, a) => s + a.length, 0)} arquivos.`);
    }
    const mesclar = (atuais, novos) => { const m = new Map(atuais.map((a) => [a.nome, a])); for (const a of novos) m.set(a.nome, a); return [...m.values()].sort((a, b) => a.nome.localeCompare(b.nome)); };

    function renderDosadores() {
        const el = $('#lista-dosadores');
        if (!estado.dosadores.length) { el.innerHTML = '<p class="nota">Nenhum dosador ainda. Adicione um, suba um ZIP ou carregue o Exemplo.</p>'; return; }
        el.innerHTML = estado.dosadores.map((d) => {
            const nRep = d.arquivos.map((a) => a.reps.length);
            const nInt = d.arquivos.reduce((s, a) => s + a.reps.reduce((t, r) => t + r.length, 0), 0);
            const tiposU = Object.entries(Dados.UNIDADES).map(([k, u]) => `<option value="${k}"${d.unidade === k ? ' selected' : ''}>${esc(u.rotulo)}</option>`).join('');
            const tiposD = Object.entries(Dados.TIPOS_DOSADOR).map(([k, t]) => `<option value="${k}"${d.tipo === k ? ' selected' : ''}>${esc(t.rotulo)}</option>`).join('');
            const massa = Dados.UNIDADES[d.unidade].tipo === 'massa';
            return `<div class="cartao" data-id="${d.id}">
                <h3>🌱 <input data-campo="nome" value="${esc(d.nome)}" aria-label="Nome do dosador"> <button type="button" class="perigo" data-acao="rem-dosador" title="Excluir este dosador">Excluir</button></h3>
                <div class="campos">
                    <label><span>Marca</span><input data-campo="marca" value="${esc(d.marca)}" placeholder="ex.: John Deere"></label>
                    <label><span>Modelo</span><input data-campo="modelo" value="${esc(d.modelo)}" placeholder="ex.: MaxEmerge 5"></label>
                    <label><span>Produto dosado</span><select data-campo="produto"><option value="sementes"${d.produto === 'sementes' ? ' selected' : ''}>Sementes</option><option value="adubo"${d.produto === 'adubo' ? ' selected' : ''}>Adubo</option></select></label>
                    <label><span>Semente / adubo (cultura, híbrido, peneira)</span><input data-campo="semente" value="${esc(d.semente)}" placeholder="ex.: milho P1225VYHR C1"></label>
                    ${massa ? '' : `<label><span>Tipo de dosador (limites de Coelho)</span><select data-campo="tipo">${tiposD}</select></label>`}
                    <label><span>Tubo condutor (qual)</span><input data-campo="tubo" value="${esc(d.tubo)}" placeholder="ex.: tubo original do fabricante, 50 cm"></label>
                    <label><span>Dado bruto</span><select data-campo="unidade">${tiposU}</select></label>
                </div>
                ${blocoReferencia(d, massa)}
                <div class="barra-acoes">
                    <label class="botao">📄 Subir CSV<input type="file" data-acao="csv" accept=".csv,.txt" multiple hidden></label>
                    <label class="botao">📦 Subir ZIP<input type="file" data-acao="zip" accept=".zip" hidden></label>
                    ${d.arquivos.length ? '<button type="button" data-acao="limpar-arq">Remover arquivos</button>' : ''}
                </div>
                <div class="resumo-arquivos">${d.arquivos.length ? `${d.arquivos.length} arquivos · ${Math.min(...nRep)}${Math.min(...nRep) !== Math.max(...nRep) ? `–${Math.max(...nRep)}` : ''} repetições por arquivo · ${nInt.toLocaleString('pt-BR')} valores` : 'Sem arquivos.'}
                ${d.arquivos.length ? `<div class="chips">${d.arquivos.slice(0, 12).map((a) => `<span class="chip">${esc(a.nome)}</span>`).join('')}${d.arquivos.length > 12 ? `<span class="chip">+${d.arquivos.length - 12}</span>` : ''}</div>` : ''}</div>
            </div>`;
        }).join('');
    }
    /** Campos da referência agronômica (obrigatória): sementes ou adubo. */
    function blocoReferencia(d, massa) {
        const ref = Dados.referenciaAgronomica(d);
        const num = (campo, rotulo, passo, dica) => `<label><span>${rotulo}</span><input type="number" step="${passo}" min="0" data-campo="${campo}" value="${d[campo] ?? ''}" placeholder="${dica}" class="${d[campo] > 0 ? '' : 'erro-campo'}"></label>`;
        let h = `<div class="ref-agro"><b>Referência agronômica</b> <span class="nota">(obrigatória)</span><div class="campos">`;
        if (massa) {
            h += num('dose', 'Dose de adubo (kg/ha)', 'any', 'ex.: 300') + num('espacamento', 'Espaçamento entre linhas (m)', 'any', 'ex.: 0,50') + num('intervalo', 'Intervalo de cada coleta (s)', 'any', 'ISO 5690-2: 30 s');
            h += '</div>';
            if (ref.ok) h += `<p class="nota">Taxa por metro de linha = ${f1(ref.gPorMetro, 2)} g/m. Massa esperada por coleta = taxa × velocidade × intervalo (ex.: a 8 km/h, ${f1(ref.gPorMetro * (8 / 3.6) * d.intervalo, 1)} g).</p>`;
        } else {
            h += `<label><span>Informar como</span><select data-campo="xrefModo"><option value="populacao"${d.xrefModo === 'populacao' ? ' selected' : ''}>População (sementes/ha) e espaçamento</option><option value="densidade"${d.xrefModo === 'densidade' ? ' selected' : ''}>Sementes por metro</option><option value="xref"${d.xrefModo === 'xref' ? ' selected' : ''}>Espaçamento de referência Xref (m)</option></select></label>`;
            if (d.xrefModo === 'populacao') h += num('populacao', 'População (sementes/ha)', '100', 'ex.: 70000') + num('espacamento', 'Espaçamento entre linhas (m)', 'any', 'ex.: 0,50');
            else if (d.xrefModo === 'densidade') h += num('densidade', 'Sementes por metro', 'any', 'ex.: 4');
            else h += num('xref', 'Xref (m)', 'any', 'ex.: 0,25');
            h += '</div>';
            if (ref.ok) h += `<p class="nota">X<sub>ref</sub> = ${f1(ref.xref, 3)} m (${f1(1 / ref.xref, 2)} sementes/m).</p>`;
        }
        return h + '</div>';
    }
    function dosadorDe(el) { const c = el.closest('.cartao'); return c && estado.dosadores.find((d) => d.id === +c.dataset.id); }

    // ---------- papéis das partes do nome ----------
    function todosArquivos() { return estado.dosadores.flatMap((d) => d.arquivos.map((a) => ({ ...a, dosador: d.nome }))); }
    function analisarNomes() {
        const arqs = todosArquivos();
        const porN = new Map();
        for (const a of arqs) { const n = Dados.tokens(a.nome).length; if (!porN.has(n)) porN.set(n, []); porN.get(n).push(a); }
        return { arqs, porN };
    }
    function validarPadrao() {
        const erros = [];
        const { arqs, porN } = analisarNomes();
        if (!arqs.length) { erros.push('Suba os arquivos dos dosadores.'); return erros; }
        if (porN.size > 1) erros.push('Os arquivos não têm todos o mesmo número de partes no nome.');
        const N = [...porN.keys()][0];
        if (estado.padrao.papeis.length !== N && porN.size === 1) { estado.padrao.papeis = Dados.sugerirPapeis(N, arqs.map((x) => Dados.tokens(x.nome))); salvar(); }
        const p = estado.padrao.papeis;
        if (p.length !== N) { erros.push('Defina o papel de cada parte do nome.'); return erros; }
        p.forEach((x, i) => { if (!x) erros.push(`Diga o que é a ${i + 1}ª parte do nome.`); });
        for (const papel of ['cond', 'long', 'lat', 'vel']) if (p.filter((x) => x === papel).length > 1) erros.push(`"${Dados.PAPEIS[papel]}" foi escolhido para mais de uma parte.`);
        return erros;
    }
    function renderFatores() {
        const el = $('#fatores-corpo');
        const { arqs, porN } = analisarNomes();
        if (!arqs.length) { el.innerHTML = '<p class="nota">Suba os arquivos na etapa 2.</p>'; return; }
        let h = '';
        if (porN.size > 1) {
            h += `<div class="pergunta"><strong>Os nomes não têm o mesmo número de partes.</strong>${[...porN.entries()].map(([n, l]) => `${n} partes: ${l.slice(0, 4).map((a) => esc(a.nome)).join(', ')}${l.length > 4 ? '…' : ''} (${l.length} arquivos)`).join('<br>')}<br>Renomeie os arquivos para seguirem o mesmo padrão e suba de novo.</div>`;
            el.innerHTML = h; return;
        }
        const N = [...porN.keys()][0];
        const toks = arqs.map((a) => Dados.tokens(a.nome));
        if (estado.padrao.papeis.length !== N) { estado.padrao.papeis = Dados.sugerirPapeis(N, toks); salvar(); }
        const p = estado.padrao.papeis;
        const numericas = [...Array(N).keys()].filter((i) => toks.every((t) => Dados.numero(t[i]) !== null));
        const angulares = numericas.filter((i) => p[i] !== 'vel');
        const doisAngulos = angulares.length >= 2;
        const exemplo = arqs[0].nome;
        h += `<p>Exemplo: <code>${esc(exemplo)}</code> → ${Dados.tokens(exemplo).map((t, i) => `<b>${esc(t)}</b> = ${esc(p[i] ? (p[i] === 'outro' ? (estado.padrao.nomesOutros[i] || 'outro fator') : Dados.PAPEIS[p[i]]) : '?')}`).join(' · ')}</p>`;
        if (doisAngulos) {
            h += `<div class="pergunta" id="pergunta-angulos"><strong>O nome tem dois ângulos. Qual é o lateral e qual é o longitudinal?</strong>
            Partes ${angulares.map((i) => `${i + 1}ª`).join(' e ')} do nome são números de ângulo. Escolha abaixo, em cada uma, "Inclinação longitudinal" ou "Inclinação lateral". A análise só roda depois dessa resposta.</div>`;
        }
        h += '<table class="tab"><thead><tr><th>Parte</th><th>Valores encontrados</th><th>O que é</th></tr></thead><tbody>';
        for (let i = 0; i < N; i++) {
            const vals = [...new Set(toks.map((t) => t[i]))].sort((a, b) => (Dados.numero(a) ?? 0) - (Dados.numero(b) ?? 0) || String(a).localeCompare(String(b)));
            const opcoes = ['', 'cond', 'long', 'lat', 'vel', 'outro', 'ignorar'].map((k) => `<option value="${k}"${p[i] === k ? ' selected' : ''}>${k ? esc(Dados.PAPEIS[k]) : '— escolha —'}</option>`).join('');
            const faltando = !p[i] || (doisAngulos && angulares.includes(i) && !['long', 'lat', 'ignorar', 'outro'].includes(p[i]));
            h += `<tr><td>${i + 1}ª</td><td>${vals.slice(0, 18).map((v) => `<span class="chip">${esc(v)}</span>`).join(' ')}${vals.length > 18 ? ` <span class="chip">+${vals.length - 18}</span>` : ''}</td>
                <td><select data-papel="${i}" class="${faltando ? 'erro-campo' : ''}">${opcoes}</select>${p[i] === 'outro' ? ` <input data-outro="${i}" placeholder="nome do fator" value="${esc(estado.padrao.nomesOutros[i] || '')}">` : ''}</td></tr>`;
        }
        h += '</tbody></table>';
        const iCond = p.indexOf('cond');
        if (iCond >= 0) {
            const vals = [...new Set(toks.map((t) => t[iCond]))];
            h += '<h2>Condução</h2><p class="nota">Como cada valor deve aparecer nos resultados. O tipo de tubo de cada dosador fica no cartão dele (etapa 2).</p><div class="campos">';
            for (const v of vals) {
                const pad = v.toLowerCase() === 'c' ? 'com tubo' : (v.toLowerCase() === 's' ? 'sem tubo' : v);
                if (estado.conducaoRotulos[v] === undefined) estado.conducaoRotulos[v] = pad;
                h += `<label><span>"${esc(v)}" significa</span><input data-cond="${esc(v)}" value="${esc(estado.conducaoRotulos[v])}"></label>`;
            }
            h += '</div>';
            const semTubo = estado.dosadores.filter((d) => !d.tubo);
            if (semTubo.length) h += `<p class="nota">⚠ Falta dizer qual tubo condutor foi usado em: ${semTubo.map((d) => esc(d.nome)).join(', ')} (cartão do dosador).</p>`;
        }
        const erros = validarPadrao();
        h += erros.length ? `<p class="alerta">${erros.map(esc).join('<br>')}</p>` : '<p class="ok">✔ Padrão do nome definido.</p>';
        el.innerHTML = h;
    }

    // ---------- configuração da análise ----------
    function niveisPorFator() {
        const rot = {}; estado.padrao.papeis.forEach((p, i) => { if (p === 'outro') rot[i] = estado.padrao.nomesOutros[i] || `Fator ${i + 1}`; });
        const lv = {};
        for (const a of todosArquivos()) {
            const f = Dados.fatoresDoArquivo(a.nome, estado.padrao.papeis, rot);
            for (const [k, v] of Object.entries(f)) { if (!lv[k]) lv[k] = new Set(); lv[k].add(v); }
        }
        return Object.fromEntries(Object.entries(lv).map(([k, s]) => [k, [...s].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))))]));
    }
    function unidadeComum() {
        const tipos = new Set(estado.dosadores.map((d) => Dados.UNIDADES[d.unidade].tipo === 'massa' ? 'massa' : 'esp'));
        return tipos.size === 1 ? estado.dosadores[0]?.unidade : null;
    }
    function limiteAtual() {
        return estado.analise.limite ?? (Dados.TIPOS_DOSADOR[estado.dosadores[0]?.tipo]?.minAceitaveis || 90);
    }
    function renderAnalise() {
        const el = $('#analise-corpo');
        const a = estado.analise;
        const erros = validarPadrao();
        const un = unidadeComum();
        if (!un && estado.dosadores.length) erros.push('Misture só dosadores com o mesmo tipo de dado (espaçamento ou massa).');
        for (const d of estado.dosadores) if (!Dados.referenciaAgronomica(d).ok) erros.push(`Informe a referência agronômica do dosador ${d.nome} (cartão na etapa 2).`);
        const resp = Dados.respostas(un || 'ms');
        if (!resp[a.resposta]) a.resposta = Object.keys(resp)[0];
        const lv = erros.length ? {} : niveisPorFator();
        const reps = todosArquivos().map((x) => x.reps.length);
        const minR = reps.length ? Math.min(...reps) : 0, maxR = reps.length ? Math.max(...reps) : 0;
        let h = `<div class="cartao"><h3>Projeto</h3><div class="campos">
            <label><span>Título do relatório</span><input data-an="titulo" value="${esc(estado.projeto.titulo)}" placeholder="ex.: Comparação de dosadores pneumáticos"></label>
            <label><span>Responsável</span><input data-an="responsavel" value="${esc(estado.projeto.responsavel)}" placeholder="nome completo"></label></div></div>`;
        h += `<div class="cartao"><h3>Resposta e testes</h3><div class="campos">
            <label><span>Variável resposta</span><select data-an="resposta">${Object.entries(resp).map(([k, v]) => `<option value="${k}"${a.resposta === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
            <label><span>Transformação</span><select data-an="transformacao"><option value="nenhuma"${a.transformacao === 'nenhuma' ? ' selected' : ''}>Nenhuma</option><option value="arcoseno"${a.transformacao === 'arcoseno' ? ' selected' : ''}>Arco-seno √p (para %)</option></select></label>
            <label><span>Nível de significância</span><select data-an="alfa"><option value="0.05"${a.alfa === 0.05 ? ' selected' : ''}>5%</option><option value="0.01"${a.alfa === 0.01 ? ' selected' : ''}>1%</option></select></label>
            <label><span>Limite de aceitáveis (%)</span><input type="number" min="0" max="100" step="1" data-an="limite" value="${limiteAtual()}"></label>
            </div>
            <label><input type="checkbox" data-an="igualarRepeticoes"${a.igualarRepeticoes ? ' checked' : ''}> Usar o mesmo número de repetições em todos os arquivos (as ${minR} primeiras)${minR !== maxR ? ` — há arquivos com até ${maxR}` : ''}</label>
            <label><input type="checkbox" data-an="descartarPrimeiro"${a.descartarPrimeiro ? ' checked' : ''}> Descartar o primeiro intervalo de cada repetição (partida do disco)</label></div>`;
        if (Object.keys(lv).length) {
            h += '<div class="cartao"><h3>Níveis analisados</h3><p class="nota">Por padrão, todos. O recorte de Andrade usa só os níveis mínimo, médio e máximo de ângulo e velocidade.</p><div class="barra-acoes"><button type="button" data-acao="recorte-todos">Todos os níveis</button><button type="button" data-acao="recorte-andrade">Recorte de Andrade (mín, médio, máx)</button></div>';
            for (const [f, niveis] of Object.entries(lv)) {
                const sel = a.recorte[f];
                h += `<p><b>${esc(Analise.nomeFator(f))}:</b> ${niveis.map((v) => `<label style="display:inline-block;margin-right:10px"><input type="checkbox" data-recorte="${esc(f)}" value="${esc(v)}"${!sel || !sel.length || sel.map(String).includes(String(v)) ? ' checked' : ''}> ${esc(Analise.rotNivel(f, v))}</label>`).join('')}</p>`;
            }
            h += '</div>';
        }
        h += `<div class="cartao"><h3>Random Forest + SHAP</h3><div class="campos">
            <label><span>Árvores</span><input type="number" min="50" max="1000" step="50" data-an="arvores" value="${a.arvores}"></label>
            <label><span>Grupos da validação cruzada</span><input type="number" min="3" max="20" step="1" data-an="folds" value="${a.folds}"></label></div>
            <p class="nota">Mais árvores deixam o resultado mais estável e a análise mais lenta.</p></div>
            <div class="cartao"><h3>Curva do processo</h3>
            <label><input type="checkbox" data-an="superficie"${a.superficie !== false ? ' checked' : ''}> Superfície contínua por processo gaussiano (resposta, incerteza e sensibilidade em qualquer ponto da faixa ensaiada)</label>
            <label><input type="checkbox" data-an="dml"${a.dml !== false ? ' checked' : ''}> Double/debiased machine learning (efeito de cada fator e curva dose-resposta; conferência com a ANOVA)</label>
            <p class="nota">As duas aumentam o tempo da análise (alguns segundos por dosador).</p></div>`;
        h += erros.length ? `<p class="alerta">${erros.map(esc).join('<br>')}</p>` : '';
        h += `<button type="button" class="primario" data-acao="rodar"${erros.length ? ' disabled' : ''}>▶ Rodar análises</button>`;
        el.innerHTML = h;
    }
    function recorteAndrade() {
        const lv = niveisPorFator();
        const rec = {};
        for (const [f, n] of Object.entries(lv)) {
            if (!['long', 'lat', 'vel'].includes(f) || n.length <= 3) continue;
            const meio = f === 'vel' ? n[Math.floor((n.length - 1) / 2)] : (n.includes(0) ? 0 : n[Math.floor((n.length - 1) / 2)]);
            rec[f] = [n[0], meio, n[n.length - 1]];
        }
        estado.analise.recorte = rec;
    }

    async function rodar() {
        const caixa = $('#progresso');
        caixa.hidden = false;
        const prog = async (t, msg) => { $('#progresso-barra').style.width = `${Math.round(t * 100)}%`; if (msg) $('#progresso-msg').textContent = msg; await new Promise((r) => setTimeout(r, 0)); };
        try {
            for (const d of estado.dosadores) d.conducao = estado.conducaoRotulos;
            const est = { ...estado, dosadores: estado.dosadores.map((d) => { const r = Dados.referenciaAgronomica(d); return { ...d, xref: r.xref, adubo: r.gPorMetro ? { gPorMetro: r.gPorMetro, intervalo: d.intervalo, dose: d.dose } : null }; }) };
            est.analise = { ...estado.analise, limite: limiteAtual() };
            res = await Analise.executar(est, prog);
            abaAtual = { anova: 0, rf: 0, graf: 0, curva: 0 };
            location.hash = '#anova';
        } catch (e) {
            console.error(e);
            aviso('Erro na análise: ' + e.message, 8000);
        } finally { caixa.hidden = true; }
    }

    // ---------- resultados ----------
    function blocos() { return res ? res.porDosador.map((b) => ({ titulo: b.nome, b })).concat(res.conjunto ? [{ titulo: 'Comparação entre dosadores', b: res.conjunto }] : []) : []; }
    function ctx() { return { res, estado, escala: estado.escala, escalaDiv: estado.escalaDiv, limite: limiteAtual() }; }
    function abas(idAbas, chave) {
        const bs = blocos();
        $(idAbas).innerHTML = bs.map((x, i) => `<button type="button" data-aba="${chave}" data-i="${i}" class="${i === abaAtual[chave] ? 'ativa' : ''}">${esc(x.titulo)}</button>`).join('');
        return bs[abaAtual[chave]]?.b;
    }
    const semRes = '<p class="nota">Rode as análises na etapa 4.</p>';
    function renderAnova() {
        if (!res) { $('#abas-anova').innerHTML = ''; $('#anova-corpo').innerHTML = semRes; return; }
        const b = abas('#abas-anova', 'anova');
        const R = Relatorio, a = estado.analise;
        const rot = R.respNome(res.y, estado.dosadores[0].unidade);
        let h = `<h2>Conclusões</h2>${R.conclusoes(b, limiteAtual(), res.resposta, a.alfa)}`;
        h += `<h2>Quadro da ANOVA — ${esc(rot)}</h2>${R.tabelaAnova(b.an, a.alfa)}<h3>Pressupostos</h3>${R.pressupostos(b)}`;
        h += `<h3>Tukey — efeitos principais</h3><div class="grade-tabs">${b.tukeyPrincipais.map((t) => `<div>${R.tabelaTukey(t, t.fator)}</div>`).join('')}</div>`;
        if (b.desdobramentos.length) {
            h += '<h3>Desdobramentos das interações significativas</h3>';
            for (const d of b.desdobramentos) h += `<h4>${esc(Analise.nomeFator(d.fator))} dentro de ${esc(d.dentro.map(Analise.nomeFator).join(' × '))}</h4>${R.tabelaDesdobramento(d)}`;
        }
        $('#anova-corpo').innerHTML = h;
    }
    function renderRF() {
        if (!res) { $('#abas-rf').innerHTML = ''; $('#rf-corpo').innerHTML = semRes; return; }
        const b = abas('#abas-rf', 'rf');
        const R = Relatorio;
        let h = `<p class="intro">Mesma resposta da ANOVA, por parcela; validação deixando tratamentos inteiros de fora; importância por permutação; SHAP exato com interações.</p>${R.tabelaRF(b.rf)}`;
        h += `<figure>${R.barrasComparativo(b.comp, blocos()[abaAtual.rf].titulo)}<figcaption>ANOVA × SHAP: parcela de cada efeito no total explicado.</figcaption></figure>`;
        h += `<h2>Erros em escala de cores</h2>${R.mapasErro(b.rf, b.fatores, ctx())}`;
        $('#rf-corpo').innerHTML = h;
    }
    function renderCores() {
        const e = estado.escala, d = estado.escalaDiv;
        const grad = (p) => `linear-gradient(90deg, ${[...p].sort((a, b) => a[0] - b[0]).map(([v, c], i, arr) => `${c} ${((v - arr[0][0]) / (arr[arr.length - 1][0] - arr[0][0])) * 100}%`).join(', ')})`;
        const linhas = (p, tipo) => p.map(([v, c], i) => `<tr><td><input type="number" step="any" data-parada="${tipo}" data-i="${i}" data-k="0" value="${v}"></td><td><input type="color" data-parada="${tipo}" data-i="${i}" data-k="1" value="${c}"></td><td><button type="button" data-acao="rem-parada" data-tipo="${tipo}" data-i="${i}" title="Remover">✕</button></td></tr>`).join('');
        $('#cores-corpo').innerHTML = `<div class="cartao"><h3>Escala dos mapas de resposta (% de aceitáveis)</h3>
            <div class="campos"><label><span>Escala pronta</span><select data-preset="esc">${Object.entries(Graficos.PRESETS).map(([k, p]) => `<option value="${k}"${e.preset === k ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}<option value="pers"${e.preset === 'pers' ? ' selected' : ''}>Personalizada</option></select></label></div>
            <div class="amostra-escala" style="background:${grad(e.paradas)}"></div>
            <table class="paradas"><thead><tr><th>Valor (%)</th><th>Cor</th><th></th></tr></thead><tbody>${linhas(e.paradas, 'esc')}</tbody></table>
            <div class="barra-acoes"><button type="button" data-acao="add-parada" data-tipo="esc">+ Parada</button>
            <label><input type="checkbox" data-esticada${e.esticada ? ' checked' : ''}> Barra de cores com trechos de mesma altura</label></div>
            <p class="nota">Entre duas paradas a cor varia de forma linear. Em falhos, múltiplos e CV (menor é melhor), as cores são invertidas automaticamente.</p></div>
            <div class="cartao"><h3>Escala divergente (SHAP e diferença RF − ANOVA)</h3>
            <div class="campos"><label><span>Escala pronta</span><select data-preset="div">${Object.entries(Graficos.PRESETS_DIV).map(([k, p]) => `<option value="${k}"${d.preset === k ? ' selected' : ''}>${esc(p.nome)}</option>`).join('')}<option value="pers"${d.preset === 'pers' ? ' selected' : ''}>Personalizada</option></select></label></div>
            <div class="amostra-escala" style="background:${grad(d.paradas)}"></div>
            <table class="paradas"><thead><tr><th>Posição (−1 a 1)</th><th>Cor</th><th></th></tr></thead><tbody>${linhas(d.paradas, 'div')}</tbody></table>
            <div class="barra-acoes"><button type="button" data-acao="add-parada" data-tipo="div">+ Parada</button></div></div>`;
    }
    function renderGraficos() {
        renderCores();
        if (!res) { $('#abas-graf').innerHTML = ''; $('#graficos-corpo').innerHTML = semRes; return; }
        const b = abas('#abas-graf', 'graf');
        const R = Relatorio, c = ctx();
        const rot = R.respNome(res.resposta, estado.dosadores[0].unidade);
        b.rowsUsadas = b.rows;
        let h = '';
        const cv = R.curvasVelocidade(b, res.resposta, c.limite, rot);
        if (cv) h += `<figure>${cv}<figcaption>${esc(rot)} × velocidade.</figcaption></figure>`;
        h += `<figure>${R.mapaResposta(b, c.escala, res.resposta, rot + ' — média ANOVA', res.resposta === 'A', c.limite, c.escalaDiv)}<figcaption>Médias de tratamento${res.resposta === 'A' ? `; ponto = IC95% abaixo de ${f1(c.limite, 0)}%` : ''}.</figcaption></figure>`;
        h += `<figure>${R.mapaRF(b.rf, b.fatores, c.escala, res.resposta, rot + ' — previsão RF', c.escalaDiv)}<figcaption>Previsão do RF fora da amostra.</figcaption></figure>`;
        h += `<h2>Erros do RF + SHAP</h2>${R.mapasErro(b.rf, b.fatores, c)}`;
        for (const m of R.mapasShap(b.rf, b.fatores, c.escalaDiv)) h += `<figure>${m.svg}<figcaption>SHAP de ${esc(Analise.nomeFator(m.fator).toLowerCase())}.</figcaption></figure>`;
        $('#graficos-corpo').innerHTML = h;
    }
    function renderCurva() {
        if (!res) { $('#abas-curva').innerHTML = ''; $('#curva-corpo').innerHTML = semRes; return; }
        const bs = blocos().filter((x) => x.b.curva);
        if (!bs.length) { $('#abas-curva').innerHTML = ''; $('#curva-corpo').innerHTML = '<p class="nota">A curva do processo é calculada por dosador. Ligue a opção na etapa 4 e rode de novo.</p>'; return; }
        if (abaAtual.curva === undefined || abaAtual.curva >= bs.length) abaAtual.curva = 0;
        $('#abas-curva').innerHTML = bs.map((x, i) => `<button type="button" data-aba="curva" data-i="${i}" class="${i === abaAtual.curva ? 'ativa' : ''}">${esc(x.titulo)}</button>`).join('');
        const b = bs[abaAtual.curva].b; b.rowsUsadas = b.rows;
        $('#curva-corpo').innerHTML = Relatorio.htmlCurva(b, ctx());
    }
    function renderRelatorio() {
        $('#relatorio-corpo').innerHTML = res ? Relatorio.documento(ctx()) : semRes;
    }

    // ---------- navegação ----------
    const PAGINAS = { inicio: () => {}, dosadores: renderDosadores, fatores: renderFatores, analise: renderAnalise, anova: renderAnova, rf: renderRF, curva: renderCurva, graficos: renderGraficos, relatorio: renderRelatorio };
    function paginaAtual() { const p = location.hash.replace('#', ''); return PAGINAS[p] ? p : 'inicio'; }
    let renderizando = false, pendente = false;
    function render() {
        if (renderizando) { pendente = true; return; }
        renderizando = true;
        try { renderAgora(); } finally { renderizando = false; }
        if (pendente) { pendente = false; setTimeout(render, 0); }
    }
    function renderAgora() {
        const p = paginaAtual();
        $$('.pagina').forEach((s) => s.classList.toggle('ativa', s.id === `pag-${p}`));
        $$('#etapas a').forEach((a) => a.classList.toggle('ativo', a.dataset.pag === p));
        document.body.classList.remove('sidebar-aberta');
        $('#topbar-projeto-nome').textContent = estado.projeto.titulo || (estado.dosadores.length ? estado.dosadores.map((d) => d.nome).join(' × ') : 'Sem título');
        const prontas = { dosadores: estado.dosadores.some((d) => d.arquivos.length), fatores: !validarPadrao().length, analise: !!res, anova: !!res, rf: !!res, curva: !!res, graficos: !!res, relatorio: !!res };
        $$('#etapas a').forEach((a) => a.classList.toggle('etapa-feito', !!prontas[a.dataset.pag]));
        PAGINAS[p]();
    }

    // ---------- exemplo ----------
    async function exemplo() {
        try {
            const r = await fetch('exemplo/DadosDosadores.zip');
            if (!r.ok) throw new Error('arquivo de exemplo não encontrado');
            estado = novoEstado(); res = null;
            const base = { produto: 'sementes', semente: 'milho híbrido P1225VYHR, peneira C1', tipo: 'pneumatico', unidade: 'ms', xrefModo: 'xref', xref: 0.25, intervalo: 30 };
            const meta = {
                JD: { ...base, marca: 'John Deere', modelo: 'MaxEmerge 5', tubo: 'tubo condutor do ensaio de Andrade' },
                PP: { ...base, marca: 'Precision Planting', modelo: 'vSet', tubo: 'tubo condutor do ensaio de Andrade' },
                Matermacc: { ...base, marca: 'Matermacc', modelo: 'carcaça modificada', tubo: 'tubo condutor do ensaio de Andrade' }
            };
            estado.projeto = { titulo: 'Exemplo — dosadores pneumáticos ensaiados por Andrade', responsavel: '' };
            await importarZipGeral(new File([await r.blob()], 'DadosDosadores.zip'), meta);
            estado.padrao.papeis = ['cond', 'long', 'vel'];
            estado.conducaoRotulos = { c: 'com tubo', s: 'sem tubo' };
            salvar(); location.hash = '#dosadores'; render();
        } catch (e) { aviso('Não foi possível carregar o exemplo: ' + e.message, 6000); }
    }

    // ---------- eventos ----------
    function ligar() {
        window.addEventListener('hashchange', render);
        $('.sidebar-toggle').addEventListener('click', () => document.body.classList.toggle('sidebar-aberta'));
        document.addEventListener('click', async (ev) => {
            const b = ev.target.closest('[data-acao]');
            if (b && b.tagName !== 'INPUT') {
                const ac = b.dataset.acao;
                if (ac === 'novo') { if (confirm('Começar um projeto vazio? O projeto atual será apagado deste navegador (exporte antes se quiser guardar).')) { estado = novoEstado(); res = null; salvar(); location.hash = '#inicio'; render(); } }
                else if (ac === 'exemplo') exemplo();
                else if (ac === 'ir-relatorio') location.hash = '#relatorio';
                else if (ac === 'fechar-menu') document.body.classList.remove('sidebar-aberta');
                else if (ac === 'exportar') baixar(`comparador-dosadores-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(estado), 'application/json');
                else if (ac === 'add-dosador') { estado.dosadores.push(novoDosador()); invalidar(); salvar(); render(); }
                else if (ac === 'rem-dosador') { const d = dosadorDe(b); if (d && confirm(`Excluir o dosador ${d.nome}?`)) { estado.dosadores = estado.dosadores.filter((x) => x !== d); invalidar(); salvar(); render(); } }
                else if (ac === 'limpar-arq') { const d = dosadorDe(b); d.arquivos = []; invalidar(); salvar(); render(); }
                else if (ac === 'recorte-todos') { estado.analise.recorte = {}; invalidar(); salvar(); render(); }
                else if (ac === 'recorte-andrade') { recorteAndrade(); invalidar(); salvar(); render(); }
                else if (ac === 'rodar') rodar();
                else if (ac === 'imprimir') { if (!res) return aviso('Rode as análises primeiro.'); renderRelatorio(); window.print(); }
                else if (ac === 'baixar-html') {
                    if (!res) return aviso('Rode as análises primeiro.');
                    let css = ''; try { css = await (await fetch('css/estilo.css')).text(); } catch (e) { css = ''; }
                    baixar('relatorio-dosadores.html', Relatorio.htmlAutonomo(ctx(), css), 'text/html');
                }
                else if (ac === 'baixar-csv') {
                    if (!res) return aviso('Rode as análises primeiro.');
                    const rows = res.porDosador.flatMap((x) => x.rows);
                    const ks = Object.keys(rows[0]);
                    baixar('parcelas.csv', [ks.join(';')].concat(rows.map((r) => ks.map((k) => (typeof r[k] === 'number' ? String(+r[k].toFixed(4)).replace('.', ',') : r[k])).join(';'))).join('\n'), 'text/csv');
                }
                else if (ac === 'add-parada') { const e = b.dataset.tipo === 'esc' ? estado.escala : estado.escalaDiv; const ult = e.paradas[e.paradas.length - 1]; e.paradas.push([ult[0], ult[1]]); e.preset = 'pers'; salvar(); render(); }
                else if (ac === 'rem-parada') { const e = b.dataset.tipo === 'esc' ? estado.escala : estado.escalaDiv; if (e.paradas.length > 2) { e.paradas.splice(+b.dataset.i, 1); e.preset = 'pers'; salvar(); render(); } }
            }
            const aba = ev.target.closest('[data-aba]');
            if (aba) { abaAtual[aba.dataset.aba] = +aba.dataset.i; render(); }
        });
        document.addEventListener('change', async (ev) => {
            const t = ev.target;
            if (t.id === 'importar-json' && t.files[0]) {
                try { const v = JSON.parse(await t.files[0].text()); if (!v.versao || !Array.isArray(v.dosadores)) throw new Error('arquivo não é um projeto do Comparador'); estado = { ...novoEstado(), ...v, analise: { ...novoEstado().analise, ...v.analise } }; idSeq = Math.max(1, ...estado.dosadores.map((d) => d.id + 1)); res = null; salvar(); render(); aviso('Projeto importado.'); } catch (e) { aviso('Não foi possível importar: ' + e.message, 6000); }
                t.value = ''; return;
            }
            if (t.id === 'zip-geral' && t.files[0]) { await importarZipGeral(t.files[0]); t.value = ''; return; }
            if (t.dataset.acao === 'csv' && t.files.length) { const d = dosadorDe(t); d.arquivos = mesclar(d.arquivos, await lerArquivos([...t.files])); invalidar(); salvar(); render(); return; }
            if (t.dataset.acao === 'zip' && t.files[0]) { const d = dosadorDe(t); const g = await lerZip(t.files[0]); d.arquivos = mesclar(d.arquivos, [...g.values()].flat()); invalidar(); salvar(); render(); return; }
            if (t.dataset.campo) {
                const d = dosadorDe(t); const k = t.dataset.campo;
                d[k] = t.type === 'number' ? (t.value === '' ? null : Number(String(t.value).replace(',', '.'))) : t.value;
                if (k === 'unidade' && Dados.UNIDADES[d.unidade].tipo === 'massa') d.produto = 'adubo';
                invalidar(); salvar();
                if (['unidade', 'xrefModo', 'tubo', 'xref', 'densidade', 'populacao', 'espacamento', 'dose', 'intervalo', 'produto'].includes(k)) render();
                return;
            }
            if (t.dataset.papel !== undefined) { estado.padrao.papeis[+t.dataset.papel] = t.value; estado.analise.recorte = {}; invalidar(); salvar(); render(); return; }
            if (t.dataset.outro !== undefined) { estado.padrao.nomesOutros[+t.dataset.outro] = t.value; invalidar(); salvar(); render(); return; }
            if (t.dataset.cond !== undefined) { estado.conducaoRotulos[t.dataset.cond] = t.value; invalidar(); salvar(); return; }
            if (t.dataset.an) {
                const k = t.dataset.an;
                if (k === 'titulo' || k === 'responsavel') { estado.projeto[k] = t.value; salvar(); return; }
                estado.analise[k] = t.type === 'checkbox' ? t.checked : (t.type === 'number' || k === 'alfa' ? Number(t.value) : t.value);
                invalidar(); salvar(); render(); return;
            }
            if (t.dataset.recorte) {
                const f = t.dataset.recorte;
                const marcados = $$(`[data-recorte="${f}"]`).filter((x) => x.checked).map((x) => (isNaN(+x.value) ? x.value : +x.value));
                estado.analise.recorte[f] = marcados;
                invalidar(); salvar(); return;
            }
            if (t.dataset.preset) {
                const alvo = t.dataset.preset === 'esc' ? estado.escala : estado.escalaDiv;
                const fonte = t.dataset.preset === 'esc' ? Graficos.PRESETS : Graficos.PRESETS_DIV;
                alvo.preset = t.value;
                if (fonte[t.value]) alvo.paradas = fonte[t.value].paradas.map((p) => p.slice());
                salvar(); render(); return;
            }
            if (t.dataset.parada) {
                const alvo = t.dataset.parada === 'esc' ? estado.escala : estado.escalaDiv;
                alvo.paradas[+t.dataset.i][+t.dataset.k] = t.dataset.k === '0' ? Number(t.value) : t.value;
                alvo.preset = 'pers'; salvar(); render(); return;
            }
            if (t.hasAttribute('data-esticada')) { estado.escala.esticada = t.checked; salvar(); render(); }
        });
    }

    async function iniciar() { await carregar(); ligar(); render(); }
    document.addEventListener('DOMContentLoaded', iniciar);
    return { get estado() { return estado; }, get res() { return res; }, render, exemplo, rodar };
})();
