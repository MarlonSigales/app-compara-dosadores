/**
 * © 2026 Comparador de Dosadores — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Montagem das tabelas, gráficos e do relatório completo (HTML imprimível e baixável).
 * As mesmas funções desenham as abas de resultados e o relatório.
 */
'use strict';

const Relatorio = (() => {
    const G = Graficos, A = Analise;
    const esc = G.esc;
    const f1 = (v, d = 2) => G.fmt(v, d);
    const fp = (p) => (!Number.isFinite(p) ? '—' : (p < 0.0001 ? '&lt;0,0001' : f1(p, 4)));
    const CURTOS = { A: 'Aceitáveis (%)', F: 'Falhos (%)', M: 'Múltiplos (%)', CVA: 'CV dos aceitáveis (%)', CV: 'CV (%)', media: 'Massa (g)', vazao: 'Vazão (g/s)', desvio: 'Desvio da dose (%)', erroAbs: 'Erro absoluto (%)', amplitude: 'Amplitude (%)', doseAplicada: 'Dose (kg/ha)' };
    const rotCurto = (y) => CURTOS[y] || y;
    const respNome = (y, unidade) => (Dados.respostas(unidade)[y.replace('_t', '')] || y) + (y.endsWith('_t') ? ' (arcsen√p)' : '');

    // ---------- tabelas ----------
    function tabelaAnova(an, alfa) {
        let h = '<table class="tab num"><thead><tr><th>Fonte de variação</th><th>GL</th><th>SQ</th><th>QM</th><th>F</th><th>Pr &gt; F</th><th>η² parcial</th></tr></thead><tbody>';
        for (const t of an.tabela) {
            h += `<tr${t.p < alfa ? ' class="sig"' : ''}><td>${esc(A.nomeTermo(t.fatores))}</td><td>${t.gl}</td><td>${f1(t.sq)}</td><td>${f1(t.qm)}</td><td>${f1(t.F)}</td><td>${fp(t.p)}</td><td>${f1(t.eta2p, 3)}</td></tr>`;
        }
        h += `<tr><td>Erro</td><td>${an.erro.gl}</td><td>${f1(an.erro.sq)}</td><td>${f1(an.erro.qm)}</td><td></td><td></td><td></td></tr>`;
        h += `<tr class="tot"><td>Total</td><td>${an.total.gl}</td><td>${f1(an.total.sq)}</td><td></td><td></td><td></td><td></td></tr></tbody></table>`;
        h += `<p class="nota">R² = ${f1(an.r2, 3)} · CV = ${f1(an.cv, 2)}% · média geral = ${f1(an.mediaGeral, 2)} · ${an.balanceado ? 'delineamento balanceado (SQ tipos I, II e III iguais)' : 'delineamento desbalanceado: SQ tipo II por mínimos quadrados'} · em destaque, termos com Pr &lt; ${f1(alfa, 2)}.</p>`;
        return h;
    }

    function pressupostos(b) {
        const ok = (p) => (p >= 0.05 ? '<span class="ok">atende</span>' : '<span class="alerta">não atende</span>');
        return `<table class="tab num"><thead><tr><th>Teste</th><th>Estatística</th><th>p</th><th>Pressuposto (α = 0,05)</th></tr></thead><tbody>
        <tr><td>Shapiro-Wilk (normalidade dos resíduos)${b.sw.amostrado ? ' — amostra de 5000' : ''}</td><td>W = ${f1(b.sw.W, 4)}</td><td>${fp(b.sw.p)}</td><td>${ok(b.sw.p)}</td></tr>
        <tr><td>Levene/Brown-Forsythe (homogeneidade entre tratamentos)</td><td>F(${b.lv.gl1}; ${b.lv.gl2}) = ${f1(b.lv.F, 3)}</td><td>${fp(b.lv.p)}</td><td>${ok(b.lv.p)}</td></tr></tbody></table>`;
    }

    function tabelaTukey(t, f) {
        let h = `<table class="tab num"><thead><tr><th>${esc(A.nomeFator(f))}</th><th>Média</th><th>Tukey</th></tr></thead><tbody>`;
        for (const m of t.medias) h += `<tr><td>${esc(m.rotulo)}</td><td>${f1(m.media)}</td><td class="letra">${esc(m.letras)}</td></tr>`;
        return h + `</tbody></table><p class="nota">DMS = ${f1(t.dms, 2)} · ${t.significativo ? 'efeito significativo' : 'efeito não significativo (letras apenas informativas)'} (p = ${fp(t.p)}).</p>`;
    }

    function tabelaDesdobramento(d) {
        if (d.omitido) return `<p class="nota">Desdobramento de ${esc(A.nomeFator(d.fator))} dentro de ${esc(d.dentro.map(A.nomeFator).join(' × '))}: ${d.nGrupos} grupos, demais para tabela. Use os mapas de calor e o intervalo de confiança de cada tratamento.</p>`;
        const niveis = [...new Set(d.grupos.flatMap((g) => g.medias.map((m) => m.rotulo)))];
        let h = `<div class="rolagem"><table class="tab num desd"><thead><tr><th>${esc(A.nomeFator(d.fator))}</th>${d.grupos.map((g) => `<th>${esc(g.dentroRot)}</th>`).join('')}</tr></thead><tbody>`;
        for (const n of niveis) {
            h += `<tr><td>${esc(n)}</td>`;
            for (const g of d.grupos) { const m = g.medias.find((x) => x.rotulo === n); h += `<td>${m ? `${f1(m.media, 1)} <span class="letra">${esc(m.letras)}</span>` : '—'}</td>`; }
            h += '</tr>';
        }
        return h + `</tbody></table></div><p class="nota">Médias seguidas da mesma letra na coluna não diferem pelo teste de Tukey (QM do erro do modelo completo). DMS = ${f1(d.grupos[0]?.dms, 2)}.</p>`;
    }

    function tabelaSigmoide(sig) {
        if (!sig.length) return '';
        let h = '<table class="tab num"><thead><tr><th>Combinação</th><th>a</th><th>b</th><th>x₀ (km/h)</th><th>R²</th></tr></thead><tbody>';
        for (const s of sig) h += `<tr><td>${esc(s.rotulo)}</td><td>${f1(s.a)}</td><td>${f1(s.b)}</td><td>${f1(s.x0)}</td><td>${f1(s.r2, 3)}</td></tr>`;
        return h + '</tbody></table><p class="nota">Modelo f(V) = a / (1 + e<sup>−(V − x₀)/b</sup>). R² baixo indica que a sigmoide não descreve bem a resposta e não deve ser usada para conclusões.</p>';
    }

    // ---------- mapas ----------
    function eixos(fatores) {
        const col = fatores.includes('vel') ? 'vel' : fatores[fatores.length - 1];
        const lin = ['long', 'lat', 'cond', 'dosador'].find((f) => fatores.includes(f) && f !== col) || fatores.find((f) => f !== col);
        const pain = fatores.filter((f) => f !== col && f !== lin);
        return { col, lin, pain };
    }
    /** Divide células {niveis, valor, marca} em painéis (linhas × colunas). */
    function paineis(celulas, fatores, valorDe, marcaDe, dicaDe) {
        const { col, lin, pain } = eixos(fatores);
        const idx = (f) => fatores.indexOf(f);
        const lvCol = [...new Set(celulas.map((c) => c.niveis[idx(col)]))].sort((a, b) => a - b || String(a).localeCompare(String(b)));
        const lvLin = lin ? [...new Set(celulas.map((c) => c.niveis[idx(lin)]))].sort((a, b) => a - b || String(a).localeCompare(String(b))) : ['—'];
        const grupos = new Map();
        for (const c of celulas) {
            const k = pain.map((f) => c.niveis[idx(f)]).join(' · ');
            if (!grupos.has(k)) grupos.set(k, { titulo: pain.map((f) => (f === 'dosador' || f === 'cond' ? c.niveis[idx(f)] : `${A.nomeCurto(f)} ${A.rotNivel(f, c.niveis[idx(f)])}`)).join(' — ') || ' ', mapa: new Map() });
            grupos.get(k).mapa.set(`${lin ? c.niveis[idx(lin)] : '—'}|${c.niveis[idx(col)]}`, c);
        }
        const ps = [...grupos.values()].map((g) => ({
            titulo: g.titulo,
            linhas: lvLin.map((v) => (lin ? A.rotNivel(lin, v) : '')),
            colunas: lvCol.map((v) => A.rotNivel(col, v)),
            valores: lvLin.map((l) => lvCol.map((cc) => { const c = g.mapa.get(`${l}|${cc}`); return c ? valorDe(c) : NaN; })),
            marcas: marcaDe ? lvLin.map((l) => lvCol.map((cc) => { const c = g.mapa.get(`${l}|${cc}`); return c ? marcaDe(c) : false; })) : null,
            dicas: dicaDe ? lvLin.map((l) => lvCol.map((cc) => { const c = g.mapa.get(`${l}|${cc}`); return c ? dicaDe(c) : ''; })) : null
        }));
        ps.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt'));
        return { ps, eixoX: A.nomeFator(col) + (col === 'vel' ? ' (km/h)' : ''), lin };
    }

    /**
     * Escala para a resposta. % aceitáveis: escala do usuário. Menor é melhor (F, M, CV, erro, amplitude): cores invertidas
     * de 0 a um máximo. Desvio da dose: escala divergente em torno de 0. Dose e vazão: escala esticada na faixa dos dados.
     */
    function escalaPara(cfgEsc, resposta, valores = [], cfgDiv = null) {
        const p = [...cfgEsc.paradas].sort((a, b) => a[0] - b[0]);
        const v0 = p[0][0], v1 = p[p.length - 1][0];
        const fin = valores.filter(Number.isFinite);
        if (resposta === 'desvio' && cfgDiv) {
            const lim = Math.max(5, Math.ceil(Math.max(...fin.map(Math.abs), 1) / 5) * 5);
            const paradas = cfgDiv.paradas.map(([v, c]) => [v * lim, c]);
            return { paradas, cor: G.escala(paradas), esticada: false };
        }
        if (['vazao', 'doseAplicada', 'media'].includes(resposta) && fin.length) {
            const a = Math.min(...fin), b = Math.max(...fin) === a ? a + 1 : Math.max(...fin);
            const paradas = p.map(([v, c]) => [a + (b - a) * (v - v0) / (v1 - v0), c]);
            return { paradas, cor: G.escala(paradas), esticada: false };
        }
        const menorMelhor = ['F', 'M', 'CVA', 'CV', 'erroAbs', 'amplitude'].includes(resposta);
        if (!menorMelhor) return { paradas: cfgEsc.paradas, cor: G.escala(cfgEsc.paradas) };
        const vmax = cfgEsc.maxInvertida || Math.max(['CV', 'CVA', 'amplitude'].includes(resposta) ? 30 : 20, Math.ceil(Math.max(...fin, 0) / 5) * 5);
        const paradas = p.map(([v, c]) => [vmax * (v1 - v) / (v1 - v0), c]).sort((a, b) => a[0] - b[0]);
        return { paradas, cor: G.escala(paradas) };
    }

    function mapaResposta(bloco, cfgEsc, resposta, rotulo, comMarcas, limite, cfgDiv) {
        const e = escalaPara(cfgEsc, resposta, (bloco.icOrig || bloco.ic).map((c) => c.media), cfgDiv);
        const menorMelhor = ['F', 'M', 'CVA', 'CV'].includes(resposta);
        const { ps, eixoX } = paineis(bloco.icOrig || bloco.ic, bloco.fatores, (c) => c.media,
            comMarcas ? (c) => (menorMelhor ? c.lo > limite : c.hi < limite) : null,
            (c) => `${c.niveis.map((v, i) => `${A.nomeCurto(bloco.fatores[i])} ${A.rotNivel(bloco.fatores[i], v)}`).join(' · ')}: ${f1(c.media, 1)} (IC95% ${f1(c.lo, 1)} a ${f1(c.hi, 1)})`);
        return G.mapas(ps, { cor: e.cor, paradas: e.paradas, esticada: e.esticada ?? cfgEsc.esticada, rotuloBarra: rotCurto(resposta), eixoX, colunas: Math.min(3, ps.length), formatoBarra: (v) => f1(v, Math.abs(v) < 10 && v % 1 ? 1 : 0) });
    }

    function mapaRF(rf, fatores, cfgEsc, resposta, rotulo, cfgDiv) {
        const e = escalaPara(cfgEsc, resposta, rf.trat.map((t) => t.media), cfgDiv);
        const cel = rf.trat.map((t) => ({ niveis: fatores.map((f) => t[f]), v: t.predCV, m: t.media }));
        const { ps, eixoX } = paineis(cel, fatores, (c) => c.v, null, (c) => `previsto ${f1(c.v, 1)} · observado ${f1(c.m, 1)}`);
        return G.mapas(ps, { cor: e.cor, paradas: e.paradas, esticada: e.esticada ?? cfgEsc.esticada, rotuloBarra: rotCurto(resposta), eixoX, colunas: Math.min(3, ps.length), formatoBarra: (v) => f1(v, Math.abs(v) < 10 && v % 1 ? 1 : 0) });
    }

    /**
     * Mapas de erro do RF+SHAP em escala de cores, por tratamento:
     * - 'cv': previsão fora da amostra (validação agrupada) − média observada (com sinal, escala divergente);
     * - 'abs': |previsão fora da amostra − média observada| (escala da resposta invertida: menor é melhor);
     * - 'shap': (base + Σφ) − média observada, o erro do modelo completo que os valores SHAP decompõem.
     */
    function mapaErro(rf, fatores, tipo, cfgDiv, cfgEsc) {
        const campo = { cv: 'erroCV', abs: 'erroCV', shap: 'erroSHAP' }[tipo];
        const cel = rf.trat.map((t) => ({ niveis: fatores.map((f) => t[f]), v: tipo === 'abs' ? Math.abs(t[campo]) : t[campo], t }));
        const maxAbs = Math.max(...rf.trat.flatMap((t) => [Math.abs(t.erroCV), Math.abs(t.erroSHAP)]));
        const lim = Math.min(Math.max(2, Math.ceil(maxAbs / 2) * 2), 20);
        const dica = (c) => `observado ${f1(c.t.media, 1)} · previsto fora da amostra ${f1(c.t.predCV, 1)} (erro ${f1(c.t.erroCV, 1)}) · modelo SHAP ${f1(c.t.predSHAP, 1)} (erro ${f1(c.t.erroSHAP, 1)})`;
        const { ps, eixoX } = paineis(cel, fatores, (c) => c.v, null, dica);
        if (tipo === 'abs') {
            const p = [...cfgEsc.paradas].sort((a, b) => a[0] - b[0]);
            const v0 = p[0][0], v1 = p[p.length - 1][0];
            const paradas = p.map(([v, c]) => [lim * (v1 - v) / (v1 - v0), c]).sort((a, b) => a[0] - b[0]);
            return G.mapas(ps, { cor: G.escala(paradas), paradas, esticada: true, rotuloBarra: '|erro| (p.p.)', eixoX, colunas: Math.min(3, ps.length), formatoBarra: (v) => f1(v, v < 10 && v % 1 ? 1 : 0) });
        }
        const paradas = cfgDiv.paradas.map(([v, c]) => [v * lim, c]);
        return G.mapas(ps, { cor: G.escala(paradas), paradas, esticada: false, rotuloBarra: tipo === 'shap' ? 'Erro do modelo SHAP (p.p.)' : 'Erro fora da amostra (p.p.)', eixoX, colunas: Math.min(3, ps.length), formatoBarra: (v) => f1(v, 0) });
    }
    /** Os três mapas de erro com legendas, para as abas e o relatório. */
    function mapasErro(rf, fatores, ctx) {
        return `<figure>${mapaErro(rf, fatores, 'cv', ctx.escalaDiv, ctx.escala)}<figcaption>Erro fora da amostra: previsão do RF para o tratamento deixado de fora do treino menos a média observada (p.p.). Lado positivo da escala: RF acima do observado; lado negativo: abaixo. Erros grandes nas bordas indicam que o RF não extrapola.</figcaption></figure>
        <figure>${mapaErro(rf, fatores, 'abs', ctx.escalaDiv, ctx.escala)}<figcaption>Erro absoluto fora da amostra (p.p.), com as cores da escala de resposta invertidas: a cor de melhor desempenho indica erro perto de zero.</figcaption></figure>
        <figure>${mapaErro(rf, fatores, 'shap', ctx.escalaDiv, ctx.escala)}<figcaption>Erro do modelo completo que os valores SHAP explicam: (base + soma dos SHAP) − média observada (p.p.). Mostra onde a explicação do SHAP parte de uma previsão imprecisa. A escala é a mesma do erro fora da amostra.</figcaption></figure>`;
    }
    const mapaDiferenca = (rf, fatores, cfgDiv) => mapaErro(rf, fatores, 'cv', cfgDiv, null);

    function mapasShap(rf, fatores, cfgDiv) {
        const lim0 = Math.max(...rf.shap.flatMap((o) => o.phi.map(Math.abs)));
        const lim = Math.max(1, Math.ceil(lim0 / 5) * 5);
        const paradas = cfgDiv.paradas.map(([v, c]) => [v * lim, c]);
        return rf.jogadores.map((j, i) => {
            const cel = rf.shap.map((o) => ({ niveis: o.niveis, v: o.phi[i] }));
            const { ps, eixoX } = paineis(cel, fatores, (c) => c.v, null, (c) => `SHAP de ${A.nomeFator(j)}: ${f1(c.v, 1)} p.p.`);
            return { fator: j, svg: G.mapas(ps, { cor: G.escala(paradas), paradas, esticada: false, rotuloBarra: `SHAP — ${A.nomeCurto(j)} (p.p.)`, eixoX, colunas: Math.min(3, ps.length), formatoBarra: (v) => f1(v, 0) }) };
        });
    }

    function curvasVelocidade(bloco, resposta, limite, rotulo) {
        if (!bloco.fatores.includes('vel')) return '';
        const fs = bloco.fatores;
        const serieF = fs.includes('cond') ? 'cond' : (fs.includes('dosador') ? 'dosador' : null);
        const painelF = fs.includes('dosador') && serieF !== 'dosador' ? 'dosador' : (fs.includes('long') ? 'long' : null);
        const g = new Map();
        for (const r of bloco.rowsUsadas) {
            const pk = painelF ? r[painelF] : '';
            const sk = serieF ? r[serieF] : 'média';
            const k = `${pk}§${sk}§${r.vel}`;
            if (!g.has(k)) g.set(k, []);
            g.get(k).push(r[resposta]);
        }
        const pain = new Map();
        for (const [k, v] of g) {
            const [pk, sk, vel] = k.split('§');
            if (!pain.has(pk)) pain.set(pk, new Map());
            const s = pain.get(pk);
            if (!s.has(sk)) s.set(sk, []);
            s.get(sk).push([+vel, v.reduce((a, b) => a + b, 0) / v.length]);
        }
        const pl = [...pain.entries()].sort((a, b) => (+a[0] - +b[0]) || a[0].localeCompare(b[0])).map(([pk, s]) => ({
            titulo: painelF ? (painelF === 'dosador' ? pk : `${A.nomeCurto(painelF)} ${A.rotNivel(painelF, +pk)}`) : 'Média dos demais fatores',
            series: [...s.entries()].map(([nome, pts]) => ({ nome, pts }))
        }));
        const vels = [...new Set(bloco.rowsUsadas.map((r) => r.vel))];
        return G.curvas(pl, { eixoX: 'Velocidade (km/h)', eixoY: rotulo, limite: resposta === 'A' ? limite : null, xticks: [Math.min(...vels), Math.round((Math.min(...vels) + Math.max(...vels)) / 2), Math.max(...vels)], colunas: 3 });
    }

    function graficoSigmoide(sig, rotulo, limite) {
        if (!sig.length) return '';
        const pl = sig.map((s) => {
            const xs = []; for (let x = s.xs[0]; x <= s.xs[s.xs.length - 1] + 1e-9; x += 0.25) xs.push(x);
            return { titulo: s.rotulo, series: [{ nome: 'observado', pts: s.xs.map((x, i) => [x, s.ys[i]]) }, { nome: 'sigmoide', pts: xs.map((x) => [x, s.f(x)]), tracejada: true, semPontos: true }] };
        });
        return G.curvas(pl, { eixoX: 'Velocidade (km/h)', eixoY: rotulo, limite, colunas: 3 });
    }

    function barrasComparativo(comp, titulo) {
        return G.barras([{ titulo, itens: comp.map((c) => c.nome), series: [{ nome: 'ANOVA (parcela do SQ)', valores: comp.map((c) => c.anova) }, { nome: 'SHAP (parcela do |valor| médio)', valores: comp.map((c) => c.shap) }] }], { eixoX: '% do total explicado', sufixo: '%', max: 105, colunas: 1 });
    }

    function tabelaRF(rf) {
        const tot = rf.importancia.reduce((s, o) => s + Math.max(o.valor, 0), 0) || 1;
        let h = `<table class="tab num"><thead><tr><th>Métrica</th><th>Valor</th></tr></thead><tbody>
        <tr><td>R² no treino</td><td>${f1(rf.r2treino, 3)}</td></tr>
        <tr><td>R² na validação agrupada por tratamento</td><td>${f1(rf.r2cv, 3)}</td></tr>
        <tr><td>Erro médio por tratamento (previsto fora da amostra × média observada)</td><td>${f1(rf.maeCelula, 2)} p.p.</td></tr>
        <tr><td>Maior erro por tratamento (fora da amostra)</td><td>${f1(rf.maxErroCelula, 2)} p.p.</td></tr>
        <tr><td>Raiz do erro quadrático médio por tratamento (fora da amostra)</td><td>${f1(rf.rmseCelula, 2)} p.p.</td></tr>
        <tr><td>Erro médio do modelo explicado pelo SHAP (base + Σφ × média observada)</td><td>${f1(rf.maeSHAP, 2)} p.p. (máximo ${f1(rf.maxErroSHAP, 2)})</td></tr>
        <tr><td>Valor de base do SHAP (média do modelo)</td><td>${f1(rf.base, 2)}</td></tr></tbody></table>`;
        h += `<table class="tab num"><thead><tr><th>Fator</th><th>Importância por permutação (queda de R²)</th><th>Parcela</th><th>|SHAP| médio</th><th>|SHAP| efeito principal</th></tr></thead><tbody>`;
        rf.importancia.forEach((o, i) => { h += `<tr><td>${esc(A.nomeFator(o.fator))}</td><td>${f1(o.valor, 3)}</td><td>${f1(100 * Math.max(o.valor, 0) / tot, 1)}%</td><td>${f1(rf.absPhi[i], 2)}</td><td>${f1(rf.absMain[i], 2)}</td></tr>`; });
        h += '</tbody></table>';
        if (rf.pares.length) {
            h += '<table class="tab num"><thead><tr><th>Interação (SHAP)</th><th>|valor| médio</th></tr></thead><tbody>';
            for (const p of [...rf.pares].sort((a, b) => b.valor - a.valor)) h += `<tr><td>${esc(A.nomeTermo(p.fatores))}</td><td>${f1(p.valor, 2)}</td></tr>`;
            h += '</tbody></table>';
        }
        return h;
    }

    function tabelaDescritiva(desc, unidade) {
        const resp = desc.respostas;
        const nomes = Dados.respostas(unidade);
        let h = `<div class="rolagem alta"><table class="tab num"><thead><tr>${desc.fatores.map((f) => `<th>${esc(A.nomeFator(f))}</th>`).join('')}${resp.map((r) => `<th>${esc(nomes[r] || r)}</th>`).join('')}</tr></thead><tbody>`;
        for (const l of desc.linhas) h += `<tr>${l.niveis.map((v, i) => `<td>${esc(A.rotNivel(desc.fatores[i], v))}</td>`).join('')}${resp.map((r) => `<td>${f1(l[r], 2)}</td>`).join('')}</tr>`;
        return h + '</tbody></table></div>';
    }

    // ---------- curva do processo (superfície contínua e DML) ----------
    function htmlCurva(bloco, ctx) {
        const cv = bloco.curva;
        if (!cv) return '<p class="nota">A curva do processo não foi calculada (opção desligada na etapa 4).</p>';
        const { res, estado } = ctx;
        const resp = res.resposta;
        const rot = respNome(resp, estado.dosadores[0].unidade);
        const fs = cv.fatores;
        const e = escalaPara(ctx.escala, resp, (bloco.icOrig || bloco.ic).map((c) => c.media), ctx.escalaDiv);
        let h = '';
        if (cv.gp) {
            const gp = cv.gp, xF = cv.xF, linF = cv.linF;
            const ux = (f) => (f === 'vel' ? 'km/h' : (f === 'long' || f === 'lat' ? '°' : ''));
            h += `<h4>Superfície contínua (processo gaussiano)</h4>
            <table class="tab num"><thead><tr><th>Métrica</th><th>Valor</th></tr></thead><tbody>
            <tr><td>Tratamentos usados no ajuste</td><td>${gp.n}</td></tr>
            <tr><td>R² deixando um tratamento de fora (fórmula exata do GP)</td><td>${f1(gp.r2loo, 3)}</td></tr>
            <tr><td>Raiz do erro quadrático médio deixando um de fora</td><td>${f1(gp.rmseLoo, 2)}</td></tr>
            <tr><td>Média de referência e amplitude do sinal (σ<sub>f</sub>)</td><td>${f1(gp.mu, 2)} · ${f1(gp.sf, 2)}</td></tr>
            ${gp.relevancia.map((r) => { const en = gp.enc.find((q) => q.f === r.fator); return `<tr><td>Comprimento de escala — ${esc(A.nomeFator(r.fator))}</td><td>${en.tipo === 'num' ? `${f1(r.ell * (en.b - en.a), 2)} ${ux(r.fator)}` : f1(r.ell, 2) + ' (0/1)'}</td></tr>`; }).join('')}
            </tbody></table>
            <p class="nota">O comprimento de escala é a distância em que a resposta muda de forma apreciável: curto indica resposta que varia depressa (curvas, picos); longo, resposta suave. Ele mede forma, não tamanho do efeito; o tamanho está na ANOVA e no SHAP.</p>`;
            // curvas y × xF com faixa de 95%, painéis pelos níveis observados do fator de linha
            const lvLin = linF ? cv.niveis[linF] : [null];
            const outros = fs.filter((f) => f !== xF && f !== linF);
            const combos = outros.reduce((acc, f) => acc.flatMap((c) => cv.niveis[f].map((v) => ({ ...c, [f]: v }))), [{}]);
            const lvX = cv.niveis[xF];
            const xs = []; for (let v = Math.min(...lvX); v <= Math.max(...lvX) + 1e-9; v += xF === 'vel' ? 0.25 : 1) xs.push(+v.toFixed(3));
            const obs = new Map((bloco.icOrig || bloco.ic).map((c) => [c.niveis.map(String).join('|'), c.media]));
            const ordem = bloco.fatores;
            const paineis = lvLin.map((l) => ({
                titulo: linF ? `${A.nomeCurto(linF)} ${A.rotNivel(linF, l)}` : 'Curva do processo',
                series: combos.flatMap((c) => {
                    const nome = outros.map((f) => A.rotNivel(f, c[f])).join(' · ') || 'modelo';
                    const val = (x) => ordem.map((f) => (f === xF ? x : (f === linF ? l : c[f])));
                    const pr = xs.map((x) => [x, gp.prever(val(x), true)]);
                    const pts = lvX.map((x) => [x, obs.get(val(x).map(String).join('|'))]).filter((q) => Number.isFinite(q[1]));
                    return [{ nome, pts: pr.map(([x, p]) => [x, p.m]), banda: pr.map(([x, p]) => [x, p.m - 1.96 * p.sd, p.m + 1.96 * p.sd]), semPontos: true },
                        { nome, pts, semLinha: true, semLegenda: true }];
                })
            }));
            h += `<figure>${G.curvas(paineis, { eixoX: A.nomeFator(xF) + (ux(xF) ? ` (${ux(xF)})` : ''), eixoY: rotCurto(resp), limite: resp === 'A' ? ctx.limite : null, colunas: 3 })}<figcaption>Curva do processo (característica estática): linha = superfície contínua do GP; faixa = intervalo de 95% da média; pontos = médias observadas dos tratamentos.</figcaption></figure>`;
            // mapas na grade fina
            const passoX = xF === 'vel' ? 0.25 : 1;
            const gx = xs, gl = linF ? (() => { const a = Math.min(...cv.niveis[linF]), b = Math.max(...cv.niveis[linF]), o = []; for (let v = a; v <= b + 1e-9; v += 1) o.push(v); return o; })() : [null];
            const rotX = gx.map((v) => (Math.abs(v - Math.round(v)) < 1e-9 && (Math.round(v) - Math.round(gx[0])) % 3 === 0 ? String(Math.round(v)) : ''));
            const rotL = gl.map((v) => (v === null ? '' : (cv.niveis[linF].includes(v) ? A.rotNivel(linF, v) : '')));
            const calc = combos.map((c) => {
                const titulo = outros.map((f) => (f === 'cond' || f === 'dosador' ? c[f] : `${A.nomeCurto(f)} ${A.rotNivel(f, c[f])}`)).join(' — ') || ' ';
                const grid = gl.map((l) => gx.map((x) => gp.prever(ordem.map((f) => (f === xF ? x : (f === linF ? l : c[f]))), true, xF)));
                return { titulo, grid };
            });
            const mk = (fn) => calc.map((p) => ({ titulo: p.titulo, linhas: rotL, colunas: rotX, valores: p.grid.map((r) => r.map(fn)), dicas: p.grid.map((r, i) => r.map((q, j) => `${p.titulo} · ${linF ? A.rotNivel(linF, gl[i]) + ' · ' : ''}${f1(gx[j], 2)} ${ux(xF)}: ${f1(q.m, 1)} ± ${f1(1.96 * q.sd, 1)} · ∂/∂${A.nomeCurto(xF)} = ${f1(q.der, 2)}`)) }));
            const cel = { celula: 13 * 16 / gx.length, alturaCelula: linF ? Math.max(3, 80 / gl.length) : 16, eixoX: A.nomeFator(xF) + (ux(xF) ? ` (${ux(xF)})` : ''), colunas: Math.min(3, calc.length) };
            h += `<figure>${G.mapas(mk((q) => q.m), { ...cel, cor: e.cor, paradas: e.paradas, esticada: e.esticada ?? ctx.escala.esticada, rotuloBarra: rotCurto(resp) })}<figcaption>Superfície contínua do GP em grade fina (${f1(passoX, 2)} ${ux(xF)}${linF ? ' × 1°' : ''}), dentro da faixa ensaiada.</figcaption></figure>`;
            const ders = calc.flatMap((p) => p.grid.flat().map((q) => Math.abs(q.der))).filter(Number.isFinite);
            const limD = Math.max(0.5, Math.ceil(Math.max(...ders) * 2) / 2);
            const parD = ctx.escalaDiv.paradas.map(([v, c]) => [v * limD, c]);
            h += `<figure>${G.mapas(mk((q) => q.der), { ...cel, cor: G.escala(parD), paradas: parD, esticada: false, rotuloBarra: `∂y/∂${A.nomeCurto(xF)} (por ${ux(xF) || 'unidade'})`, formatoBarra: (v) => f1(v, 1) })}<figcaption>Sensibilidade (ganho local): quanto a resposta muda para cada 1 ${ux(xF) || 'unidade'} a mais de ${A.nomeFator(xF).toLowerCase()}. Perto de zero: insensível; lado negativo da escala: a resposta cai.</figcaption></figure>`;
            const meias = calc.flatMap((p) => p.grid.flat().map((q) => 1.96 * q.sd));
            const limI = Math.max(1, Math.ceil(Math.max(...meias)));
            const pI = [...ctx.escala.paradas].sort((a, b) => a[0] - b[0]);
            const parI = pI.map(([v, c]) => [limI * (pI[pI.length - 1][0] - v) / (pI[pI.length - 1][0] - pI[0][0]), c]).sort((a, b) => a[0] - b[0]);
            h += `<figure>${G.mapas(mk((q) => 1.96 * q.sd), { ...cel, cor: G.escala(parI), paradas: parI, rotuloBarra: 'Meia-largura IC95%', esticada: false, formatoBarra: (v) => f1(v, 1) })}<figcaption>Incerteza da superfície (meia-largura do intervalo de 95%): cresce longe dos tratamentos ensaiados.</figcaption></figure>`;
        }
        if (cv.plr) {
            const un = (f) => (f === 'vel' ? 'p.p. por km/h' : (f === 'long' || f === 'lat' ? 'p.p. por grau' : 'p.p.'));
            h += `<h4>Double/debiased machine learning (DML)</h4>
            <table class="tab num"><thead><tr><th>Fator (tratamento no DML)</th><th>Efeito θ</th><th>Erro-padrão</th><th>IC95%</th><th>p</th><th>Unidade</th></tr></thead><tbody>
            ${cv.plr.map((o) => `<tr><td>${esc(A.nomeFator(o.fator))}${o.binario ? ` (${esc(String(o.niveis[o.niveis.length - 1]))} − ${esc(String(o.niveis[0]))})` : ''}</td><td>${f1(o.theta, 3)}</td><td>${f1(o.se, 3)}</td><td>${f1(o.lo, 3)} a ${f1(o.hi, 3)}</td><td>${fp(o.p)}</td><td>${un(o.fator)}</td></tr>`).join('')}
            </tbody></table>
            <p class="nota">Modelo parcialmente linear: θ é o efeito linear médio do fator, descontado o efeito dos demais (aprendido por Random Forest com ajuste cruzado). Em fatores com resposta não monotônica (ex.: melhor em 0° e pior nos extremos), θ perto de zero não significa ausência de efeito: veja a curva abaixo.</p>`;
            for (const c of cv.curvas) {
                const f = c.fator, num = c.pontos.every((p) => typeof p.nivel === 'number');
                h += `<h5>Curva dose-resposta de ${esc(A.nomeFator(f).toLowerCase())} (AIPW) × médias marginais da ANOVA — maior diferença: ${f1(c.maxDif, 2)} p.p.</h5>`;
                if (num && c.pontos.length > 2) {
                    h += `<figure>${G.curvas([{ titulo: A.nomeFator(f), series: [{ nome: 'DML (AIPW)', pts: c.pontos.map((p) => [p.nivel, p.media]), banda: c.pontos.map((p) => [p.nivel, p.lo, p.hi]) }, { nome: 'Média marginal da ANOVA', pts: c.pontos.map((p) => [p.nivel, p.anova]), semLinha: true }] }], { eixoX: A.nomeFator(f), eixoY: rotCurto(resp), colunas: 1 })}<figcaption>Curva do DML com intervalo de 95% e médias marginais da ANOVA.</figcaption></figure>`;
                }
                h += `<div class="rolagem"><table class="tab num"><thead><tr><th>${esc(A.nomeFator(f))}</th><th>DML (AIPW)</th><th>IC95%</th><th>Média marginal ANOVA</th><th>Diferença</th></tr></thead><tbody>${c.pontos.map((p) => `<tr><td>${esc(A.rotNivel(f, p.nivel))}</td><td>${f1(p.media, 2)}</td><td>${f1(p.lo, 2)} a ${f1(p.hi, 2)}</td><td>${f1(p.anova, 2)}</td><td>${f1(p.media - p.anova, 2)}</td></tr>`).join('')}</tbody></table></div>`;
            }
            h += '<p class="nota">No ensaio fatorial balanceado, os fatores são fixados pelo delineamento (não há confusão a corrigir); por isso a curva do DML deve coincidir com as médias marginais da ANOVA, e serve de conferência. O DML acrescenta informação quando houver dados de campo ou de ensaios não controlados.</p>';
        }
        return h;
    }

    function tabelaParcelas(rows, fatores, unidade) {
        const resp = Object.keys(Dados.respostas(unidade)).filter((k) => rows[0] && rows[0][k] !== undefined);
        const nomes = Dados.respostas(unidade);
        let h = `<div class="rolagem alta"><table class="tab num"><thead><tr><th>Arquivo</th><th>Rep.</th>${fatores.filter((f) => f !== 'dosador').map((f) => `<th>${esc(A.nomeFator(f))}</th>`).join('')}<th>n</th>${resp.map((r) => `<th>${esc(rotCurto(r) || nomes[r])}</th>`).join('')}</tr></thead><tbody>`;
        for (const r of rows) h += `<tr><td>${esc(r.arquivo)}</td><td>${r.rep}</td>${fatores.filter((f) => f !== 'dosador').map((f) => `<td>${esc(A.rotNivel(f, r[f]))}</td>`).join('')}<td>${r.n}</td>${resp.map((k) => `<td>${f1(r[k], 2)}</td>`).join('')}</tr>`;
        return h + '</tbody></table></div>';
    }

    // ---------- conclusões automáticas ----------
    function conclusoes(bloco, limite, resposta, alfa) {
        const an = bloco.an;
        const sig = an.tabela.filter((t) => t.p < alfa).sort((a, b) => b.sq - a.sq);
        const top = sig[0];
        const out = [];
        if (top) out.push(`Pela ANOVA, o maior efeito é <b>${esc(A.nomeTermo(top.fatores))}</b> (${f1(100 * top.parcela, 0)}% da soma de quadrados dos efeitos, η²p = ${f1(top.eta2p, 2)}).`);
        else out.push('Nenhum efeito foi significativo pela ANOVA.');
        const ns = an.tabela.filter((t) => t.p >= alfa).map((t) => A.nomeTermo(t.fatores));
        if (ns.length) out.push(`Não significativos (α = ${f1(alfa, 2)}): ${esc(ns.join(', '))}.`);
        const compTop = [...bloco.comp].sort((a, b) => b.shap - a.shap)[0];
        const anTop = [...bloco.comp].sort((a, b) => b.anova - a.anova)[0];
        if (compTop && anTop) out.push(compTop.nome === anTop.nome
            ? `O RF+SHAP concorda: o termo de maior contribuição também é <b>${esc(compTop.nome)}</b> (${f1(compTop.shap, 0)}% no SHAP × ${f1(anTop.anova, 0)}% na ANOVA, entre efeitos principais e pares).`
            : `O RF+SHAP aponta <b>${esc(compTop.nome)}</b> como maior contribuição (${f1(compTop.shap, 0)}%), enquanto a ANOVA aponta <b>${esc(anTop.nome)}</b> (${f1(anTop.anova, 0)}%). Confira os mapas: diferenças costumam vir de efeitos de borda ou de interações de ordem 3.`);
        if (resposta === 'A') {
            const ic = bloco.icOrig || bloco.ic; const abaixo = ic.filter((c) => c.hi < limite).length;
            out.push(`${abaixo} de ${ic.length} tratamentos ficaram com o intervalo de confiança de 95% inteiro abaixo de ${f1(limite, 0)}% de aceitáveis.`);
        }
        const nota = resposta === 'desvio' ? (c) => -Math.abs(c.media) : (['F', 'M', 'CVA', 'CV', 'erroAbs', 'amplitude'].includes(resposta) ? (c) => -c.media : (c) => c.media);
        const ord = [...(bloco.icOrig || bloco.ic)].sort((a, b) => nota(b) - nota(a));
        const rot = (c) => c.niveis.map((v, i) => `${A.nomeCurto(bloco.fatores[i])} ${A.rotNivel(bloco.fatores[i], v)}`).join(', ');
        if (ord.length > 2) out.push(`Melhor tratamento: ${esc(rot(ord[0]))} (${f1(ord[0].media, 1)}). Pior: ${esc(rot(ord[ord.length - 1]))} (${f1(ord[ord.length - 1].media, 1)}).`);
        if (bloco.sw.p < 0.05 || bloco.lv.p < 0.05) out.push('Os pressupostos da ANOVA não foram todos atendidos: confira a análise com a transformação arcsen√p (configuração da análise) antes de concluir.');
        return `<ul class="conclusoes">${out.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    }

    // ---------- seções ----------
    function secaoBloco(bloco, titulo, ctx, num) {
        const { res, estado } = ctx;
        const a = estado.analise;
        const unidade = bloco.dosador?.unidade || estado.dosadores[0].unidade;
        const rot = respNome(res.y, unidade);
        const rotOrig = respNome(res.resposta, unidade);
        const limite = ctx.limite;
        bloco.rowsUsadas = bloco.rows;
        let h = `<section class="bloco"><h2>${num}. ${esc(titulo)}</h2>`;
        if (bloco.excluidos) h += `<p class="nota">Para comparar os dosadores, entram só os tratamentos presentes em todos eles (${bloco.excluidos} parcelas ficaram de fora).</p>`;
        h += `<h3>${num}.1 Conclusões</h3>${conclusoes(bloco, limite, res.resposta, a.alfa)}`;
        h += `<h3>${num}.2 Comportamento</h3>`;
        const cv = curvasVelocidade(bloco, res.resposta, limite, rotOrig);
        if (cv) h += `<figure>${cv}<figcaption>${esc(rotOrig)} em função da velocidade (média dos demais fatores).</figcaption></figure>`;
        h += `<figure>${mapaResposta(bloco, ctx.escala, res.resposta, rotOrig, false, limite, ctx.escalaDiv)}<figcaption>${esc(rotOrig)} por tratamento (média das repetições).</figcaption></figure>`;
        h += `<h3>${num}.3 ANOVA (${esc(rot)})</h3>${tabelaAnova(bloco.an, a.alfa)}`;
        h += `<h4>Pressupostos</h4>${pressupostos(bloco)}`;
        h += `<h4>Teste de Tukey — efeitos principais</h4><div class="grade-tabs">${bloco.tukeyPrincipais.map((t) => `<div>${tabelaTukey(t, t.fator)}</div>`).join('')}</div>`;
        if (bloco.desdobramentos.length) {
            h += '<h4>Desdobramentos das interações significativas</h4>';
            for (const d of bloco.desdobramentos) h += `<h5>${esc(A.nomeFator(d.fator))} dentro de ${esc(d.dentro.map(A.nomeFator).join(' × '))} (interação ${esc(A.nomeTermo(d.termo))})</h5>${tabelaDesdobramento(d)}`;
        }
        const marcas = res.resposta === 'A';
        h += `<figure>${mapaResposta(bloco, ctx.escala, res.resposta, rotOrig + ' — média ANOVA', marcas, limite, ctx.escalaDiv)}<figcaption>Médias de tratamento da ANOVA${marcas && res.resposta === 'A' ? `. Ponto: intervalo de confiança de 95% (QM do erro, ${bloco.an.erro.gl} GL) inteiro abaixo de ${f1(limite, 0)}%` : ''}.</figcaption></figure>`;
        if (bloco.sig?.length) {
            h += `<h4>Ajuste sigmoidal (como em Andrade)</h4>${tabelaSigmoide(bloco.sig)}`;
            h += `<figure>${graficoSigmoide(bloco.sig.filter((s) => s.niveis.some((v) => v === 0) || bloco.sig.length <= 6).slice(0, 6), rotOrig, res.resposta === 'A' ? limite : null)}<figcaption>Ajuste sigmoidal${bloco.sig.length > 6 ? ' (combinações com ângulo 0°)' : ''}.</figcaption></figure>`;
        }
        h += `<h3>${num}.4 Random Forest + SHAP (proposta)</h3>`;
        h += `<p>Mesma resposta da ANOVA (${esc(rotOrig)}, por parcela), cada fator como um único jogador, validação agrupada por tratamento (${a.folds} grupos; o modelo não vê nenhuma repetição do tratamento previsto), importância por permutação e SHAP exato com interações.</p>`;
        h += tabelaRF(bloco.rf);
        h += `<figure>${barrasComparativo(bloco.comp, titulo)}<figcaption>Parcela de cada efeito no total explicado: ANOVA × SHAP (efeitos principais e pares).</figcaption></figure>`;
        h += `<figure>${mapaRF(bloco.rf, bloco.fatores, ctx.escala, res.resposta, rotOrig + ' — previsão RF', ctx.escalaDiv)}<figcaption>Previsão do RF para tratamentos deixados de fora do treino.</figcaption></figure>`;
        h += `<h4>Erros do RF + SHAP em escala de cores</h4>${mapasErro(bloco.rf, bloco.fatores, ctx)}`;
        for (const m of mapasShap(bloco.rf, bloco.fatores, ctx.escalaDiv)) h += `<figure>${m.svg}<figcaption>Contribuição SHAP de ${esc(A.nomeFator(m.fator).toLowerCase())} em cada tratamento, em relação à média do modelo (${f1(bloco.rf.base, 1)}).</figcaption></figure>`;
        if (bloco.curva) h += `<h3>${num}.5 Curva do processo (superfície contínua e DML)</h3>${htmlCurva(bloco, ctx)}`;
        h += `<h3>${num}.${bloco.curva ? 6 : 5} Dados completos</h3><details class="apendice" open><summary>Médias de todas as respostas por tratamento</summary>${tabelaDescritiva(bloco.desc, unidade)}</details>`;
        h += `<details class="apendice"><summary>Todas as parcelas (${bloco.rows.length})</summary>${tabelaParcelas(bloco.rows, bloco.fatores, unidade)}</details>`;
        return h + '</section>';
    }

    function refTexto(d) {
        const r = Dados.referenciaAgronomica(d);
        if (Dados.UNIDADES[d.unidade].tipo === 'massa') return r.ok ? `${f1(d.dose, 0)} kg/ha, linhas a ${f1(d.espacamento, 2)} m (${f1(r.gPorMetro, 2)} g/m); coletas de ${f1(d.intervalo, 0)} s` : '—';
        if (!r.ok) return '—';
        const base = `X<sub>ref</sub> = ${f1(r.xref, 3)} m (${f1(1 / r.xref, 2)} sementes/m)`;
        return d.xrefModo === 'populacao' ? `${Math.round(d.populacao).toLocaleString('pt-BR')} sementes/ha, linhas a ${f1(d.espacamento, 2)} m → ${base}` : base;
    }

    /** 1. Dados: o que foi ensaiado e o que entrou na análise. */
    function secaoDados(ctx) {
        const { estado, res } = ctx;
        const a = estado.analise;
        const linhasDos = estado.dosadores.map((d) => {
            const nInt = d.arquivos.reduce((s, x) => s + x.reps.reduce((t, r) => t + r.length, 0), 0);
            return `<tr><td>${esc(d.nome)}</td><td>${esc([d.marca, d.modelo].filter(Boolean).join(' ') || '—')}</td><td>${esc(d.produto === 'adubo' ? 'Adubo' : 'Sementes')}${d.semente ? ' — ' + esc(d.semente) : ''}</td><td>${Dados.UNIDADES[d.unidade].tipo === 'massa' ? '—' : esc(Dados.TIPOS_DOSADOR[d.tipo]?.rotulo || '')}</td><td>${esc(d.tubo || '—')}</td><td>${esc(Dados.UNIDADES[d.unidade].rotulo)}</td><td>${refTexto(d)}</td><td>${d.arquivos.length}</td><td>${nInt.toLocaleString('pt-BR')}</td></tr>`;
        }).join('');
        const papeis = estado.padrao.papeis.map((p, i) => `${i + 1}ª parte = ${esc(p === 'outro' ? (estado.padrao.nomesOutros?.[i] || 'outro fator') : (Dados.PAPEIS[p] || '—'))}`).join('; ');
        const todos = res.porDosador.flatMap((b) => b.rows);
        const fatores = [...new Set(res.porDosador.flatMap((b) => b.fatores))];
        const niveis = fatores.map((f) => `<tr><td>${esc(A.nomeFator(f))}</td><td>${Estat.niveisDe(todos, f).map((v) => esc(A.rotNivel(f, v))).join(', ')}</td><td>${Estat.niveisDe(todos, f).length}</td></tr>`).join('');
        const rot = respNome(res.resposta, estado.dosadores[0].unidade);
        const resumo = res.porDosador.map((b) => {
            const v = b.rows.map((r) => r[res.resposta]).filter(Number.isFinite);
            return `<tr><td>${esc(b.nome)}</td><td>${b.rows.length}</td><td>${b.ic.length}</td><td>${f1(Estat.media(v), 2)}</td><td>${f1(Estat.dp(v), 2)}</td><td>${f1(Math.min(...v), 2)}</td><td>${f1(Math.max(...v), 2)}</td></tr>`;
        }).join('');
        const conds = Object.entries(estado.conducaoRotulos || {}).map(([k, v]) => `"${esc(k)}" = ${esc(v)}`).join('; ');
        return `<section class="bloco"><h2>1. Dados</h2>
        <h3>1.1 Dosadores ensaiados</h3>
        <table class="tab"><thead><tr><th>Nome</th><th>Marca e modelo</th><th>Produto</th><th>Tipo</th><th>Tubo condutor</th><th>Dado bruto</th><th>Referência agronômica</th><th>Arquivos</th><th>Valores brutos</th></tr></thead><tbody>${linhasDos}</tbody></table>
        <h3>1.2 Fatores e níveis</h3>
        <p>Nome dos arquivos: ${papeis}.${conds ? ` Condução: ${conds}.` : ''}</p>
        <table class="tab"><thead><tr><th>Fator</th><th>Níveis analisados</th><th>Nº</th></tr></thead><tbody>${niveis}</tbody></table>
        <h3>1.3 Parcelas analisadas</h3>
        <p>${res.nParcelas} parcelas no total${a.igualarRepeticoes ? `, com ${res.minReps} repetições por tratamento` : ''}${a.descartarPrimeiro ? '; o primeiro intervalo de cada repetição foi descartado' : ''}${a.recorte && Object.values(a.recorte).some((x) => x && x.length) ? '; houve recorte de níveis (ver 1.2)' : ''}. Resumo de ${esc(rot)} por parcela:</p>
        <table class="tab num"><thead><tr><th>Dosador</th><th>Parcelas</th><th>Tratamentos</th><th>Média</th><th>Desvio-padrão</th><th>Mínimo</th><th>Máximo</th></tr></thead><tbody>${resumo}</tbody></table></section>`;
    }

    /** 2. Metodologia passo a passo, com os valores efetivamente usados. */
    function secaoMetodologia(ctx) {
        const { estado, res } = ctx;
        const a = estado.analise;
        const massa = Dados.UNIDADES[estado.dosadores[0].unidade].tipo === 'massa';
        const tempo = Dados.UNIDADES[estado.dosadores[0].unidade].tipo === 'tempo';
        const fatTxt = [...new Set(res.porDosador.flatMap((b) => b.fatores))].map(A.nomeFator).join(', ');
        const passos = [];
        passos.push(`<b>Leitura dos dados brutos.</b> Cada arquivo CSV corresponde a um tratamento; a primeira coluna (índice <code>n</code>) é ignorada e cada coluna seguinte é uma repetição. Cada repetição é uma <b>parcela</b> e todas as respostas são calculadas por parcela, nunca por semente isolada. Células vazias são ignoradas. Os fatores de cada tratamento vêm das partes do nome do arquivo, separadas por "_" (seção 1.2).`);
        if (massa) {
            passos.push(`<b>Referência agronômica (adubo).</b> Taxa por metro de linha: q = D × e / 10, com D = dose (kg/ha) e e = espaçamento entre linhas (m), resultando em g/m. Massa esperada em cada coleta: m<sub>alvo</sub> = q × (V / 3,6) × Δt, com V em km/h e Δt = intervalo de coleta (s). Os valores usados estão na seção 1.1.`);
            passos.push(`<b>Respostas por parcela (ISO 5690-2).</b> Com as n massas m<sub>i</sub> de uma parcela: média m̄; vazão = m̄ / Δt (g/s); uniformidade pelo coeficiente de variação CV = 100 · s / m̄, com s = desvio-padrão amostral; amplitude relativa = 100 · (m<sub>máx</sub> − m<sub>mín</sub>) / m̄ (ISO 5690-2, 7.1.2); exatidão pelo desvio em relação à dose regulada = 100 · (m̄ − m<sub>alvo</sub>) / m<sub>alvo</sub>, seu valor absoluto e a dose aplicada = D · m̄ / m<sub>alvo</sub> (kg/ha). A ISO 5690-2 define vazão como massa distribuída por unidade de tempo, usa leituras de 30 s no ensaio estático e prevê ensaios com o distribuidor inclinado (20%, cerca de 11°) e com níveis diferentes de adubo no depósito.`);
        } else {
            passos.push(`<b>Referência agronômica (sementes).</b> X<sub>ref</sub> = 10 000 / (P × e) quando informada a população P (sementes/ha) e o espaçamento entre linhas e (m); X<sub>ref</sub> = 1 / d quando informadas d sementes por metro; ou X<sub>ref</sub> informado diretamente.${tempo ? ' Como os dados estão em tempo, cada intervalo T<sub>i</sub> (ms) é comparado com T<sub>ref</sub> = 3,6 · X<sub>ref</sub> / V × 1000 (X<sub>ref</sub> em m, V em km/h), calculado para a velocidade de cada tratamento.' : ' Como os dados estão em distância, cada espaçamento X<sub>i</sub> é comparado diretamente com X<sub>ref</sub>.'}`);
            passos.push(`<b>Classificação de cada espaçamento (Coelho, 1996).</b> Com a razão r = X<sub>i</sub> / X<sub>ref</sub> (ou T<sub>i</sub> / T<sub>ref</sub>): múltiplo se r &lt; 0,5; aceitável se 0,5 ≤ r ≤ 1,5; falho se r &gt; 1,5.`);
            passos.push(`<b>Respostas por parcela.</b> % aceitáveis, % falhos e % múltiplos = número de espaçamentos de cada classe / total de espaçamentos da parcela × 100; CV dos aceitáveis = 100 · s / média das razões r dos espaçamentos aceitáveis; CV de todos os espaçamentos = o mesmo com todas as razões. Limite de desempenho adotado: ${f1(ctx.limite, 0)}% de aceitáveis (${esc(Dados.TIPOS_DOSADOR[estado.dosadores[0].tipo]?.rotulo || '')}, Coelho, 1996).`);
        }
        passos.push(`<b>Preparação do delineamento.</b> ${a.igualarRepeticoes ? `Foram usadas as ${res.minReps} primeiras repetições de cada arquivo, para que todos os tratamentos tenham o mesmo número de parcelas.` : 'Foram usadas todas as repetições de cada arquivo.'}${a.descartarPrimeiro ? ' O primeiro intervalo de cada repetição foi descartado (partida do disco).' : ''}${a.recorte && Object.values(a.recorte).some((x) => x && x.length) ? ' Só os níveis listados na seção 1.2 entraram na análise.' : ''} Variável resposta: ${esc(respNome(res.resposta, estado.dosadores[0].unidade))}${res.transformado ? ', transformada por y\' = arcsen(√(y/100)), em graus, para a ANOVA' : ''}.`);
        passos.push(`<b>Análise de variância.</b> Delineamento inteiramente casualizado em esquema fatorial completo com os fatores ${esc(fatTxt)} e todas as suas interações, analisado separadamente para cada dosador: y = μ + efeitos principais + todas as interações + erro. Fatores com um único nível são retirados do modelo. Em delineamento balanceado, a soma de quadrados de cada termo é calculada pelas médias marginais (iguais às dos tipos I, II e III); em delineamento desbalanceado, pelo tipo II, por mínimos quadrados com codificação por efeitos. Para cada termo: QM = SQ / GL, F = QM / QM<sub>erro</sub>, Pr &gt; F pela distribuição F e η² parcial = SQ / (SQ + SQ<sub>erro</sub>). Também são informados R² = 1 − SQ<sub>erro</sub> / SQ<sub>total</sub> e CV = 100 · √QM<sub>erro</sub> / média geral. Nível de significância: ${f1(a.alfa * 100, 0)}%.`);
        passos.push(`<b>Pressupostos.</b> Normalidade dos resíduos (y − média do tratamento) pelo teste de Shapiro-Wilk (algoritmo de Royston; acima de 5000 resíduos, amostra sistemática de 5000) e homogeneidade das variâncias entre tratamentos pelo teste de Levene centrado na mediana (Brown-Forsythe). Quando algum pressuposto não é atendido, recomenda-se repetir a análise com a transformação arco-seno.`);
        passos.push(`<b>Teste de Tukey.</b> Para cada efeito principal, as médias marginais são comparadas pela diferença mínima significativa DMS = q<sub>α; k; GL erro</sub> · √(QM<sub>erro</sub> / n), com q da distribuição da amplitude estudentizada, k = número de médias e n = parcelas por média (Tukey-Kramer quando n difere). As letras agrupam médias consecutivas, em ordem decrescente, que não diferem entre si.`);
        passos.push(`<b>Desdobramento das interações.</b> Para cada interação significativa, os níveis de cada fator foram comparados por Tukey dentro de cada combinação dos demais fatores da interação, sempre com o QM e os GL do erro do modelo completo. Desdobramentos com mais de ${a.maxGrupos || 40} grupos não são tabelados; nesse caso, a leitura é feita pelos mapas de calor e pelos intervalos de confiança.`);
        passos.push(`<b>Intervalo de confiança de cada tratamento.</b> IC${f1((1 - a.alfa) * 100, 0)}% = média ± t<sub>${f1(1 - a.alfa / 2, 3)}; GL erro</sub> · √(QM<sub>erro</sub> / n). ${massa ? '' : `Nos mapas da ANOVA, o ponto marca os tratamentos cujo intervalo inteiro fica abaixo de ${f1(ctx.limite, 0)}%.`}`);
        passos.push(`<b>Ajuste sigmoidal.</b> Em cada combinação dos demais fatores com pelo menos 4 velocidades, a média da resposta foi ajustada a f(V) = a / (1 + e<sup>−(V − x₀)/b</sup>) por mínimos quadrados não lineares (Levenberg-Marquardt), com R² = 1 − SQ<sub>resíduo</sub> / SQ<sub>total</sub>, como em Andrade.`);
        passos.push(`<b>Random Forest (proposta de correção do RF+SHAP).</b> A mesma resposta por parcela da ANOVA (sem transformação) foi modelada por ${a.arvores} árvores de regressão, cada uma treinada numa amostra bootstrap, com divisões que minimizam a soma de quadrados, no mínimo 2 parcelas por folha e todos os fatores avaliados em cada divisão; a previsão é a média das árvores (semente aleatória fixa, para reprodutibilidade). Codificação: condução numa única coluna 0/1 (sem a coluna redundante), ângulos e velocidade como números e dosador em colunas indicadoras agrupadas.`);
        passos.push(`<b>Validação do Random Forest.</b> Validação cruzada agrupada por tratamento em ${a.folds} grupos: as repetições de um mesmo tratamento ficam sempre no mesmo grupo, de modo que cada tratamento é previsto por um modelo que não viu nenhuma de suas repetições (${Math.max(50, Math.round(a.arvores / 2))} árvores em cada modelo da validação). São informados o R² no treino, o R² na validação e, por tratamento, o erro fora da amostra (previsão média − média observada), seu valor absoluto e a raiz do erro quadrático médio. Esses erros, e o erro do modelo completo que o SHAP explica ((base + Σφ) − média observada), são apresentados em mapas de cores com a mesma escala divergente, para mostrar onde o RF erra e onde a explicação do SHAP parte de previsões imprecisas.`);
        passos.push(`<b>Importância por permutação.</b> No modelo completo, as colunas de cada fator foram embaralhadas juntas (5 repetições) e a importância é a queda média do R². Esse método não favorece fatores com muitos níveis, ao contrário da importância por impureza.`);
        passos.push(`<b>SHAP exato com interações.</b> Para cada tratamento x, o valor de uma coalizão S de fatores é v(S) = média, sobre todos os tratamentos observados (fundo), da previsão com os fatores de S fixados nos níveis de x. O valor SHAP do fator i é φ<sub>i</sub> = Σ<sub>S</sub> |S|!(M − |S| − 1)!/M! · [v(S ∪ {i}) − v(S)], com M fatores, e as interações de pares seguem o índice de interação de Shapley (convenção do pacote shap, metade para cada fator do par). A soma dos φ com o valor de base (média do modelo) reproduz a previsão. Para comparar com a ANOVA, calcula-se a parcela de cada efeito principal e de cada par no total: SQ do termo na ANOVA e |valor SHAP| médio no RF.`);
        const temCurva = res.porDosador.some((b) => b.curva);
        if (temCurva && res.porDosador.some((b) => b.curva?.gp)) passos.push(`<b>Superfície contínua (curva do processo).</b> Para cada dosador, as médias dos tratamentos da resposta original foram ajustadas por um processo gaussiano: y(x) = μ + f(x), com f de covariância k(x, x') = σ<sub>f</sub>² · exp(−½ Σ<sub>d</sub> (x<sub>d</sub> − x'<sub>d</sub>)² / ℓ<sub>d</sub>²), fatores numéricos escalados para 0–1 e condução como 0/1. O ruído de cada média foi fixado em QM<sub>erro</sub> / n (da ANOVA), de modo que a superfície respeita a incerteza experimental. σ<sub>f</sub> e os comprimentos de escala ℓ<sub>d</sub> foram estimados maximizando a verossimilhança marginal (Nelder-Mead). A superfície fornece, em qualquer ponto da faixa ensaiada, a média prevista, o intervalo de 95% (± 1,96 desvio-padrão posterior) e a sensibilidade ∂y/∂V (derivada analítica), calculadas numa grade fina (velocidade a cada 0,25 km/h e ângulos a cada 1°). A qualidade é medida pelo R² deixando um tratamento de fora, pela fórmula exata do GP. É a característica estática do dosador (regime permanente); uma função de transferência dinâmica exigiria ensaios com variação de velocidade no tempo.`);
        if (temCurva && res.porDosador.some((b) => b.curva?.plr)) passos.push(`<b>Double/debiased machine learning.</b> Para cada fator D, com os demais fatores X: (i) modelo parcialmente linear y = θ·D + g(X) + e, com ỹ = y − ĝ(X) e D̃ = D − m̂(X) estimados por Random Forest (60 árvores, mínimo de 5 parcelas por folha) com ajuste cruzado em 5 grupos aleatórios de parcelas, θ = Σ D̃·ỹ / Σ D̃² e erro-padrão pelo escore ortogonal de Neyman (Chernozhukov et al., 2018); (ii) curva dose-resposta por AIPW: para cada nível v, ψ<sub>v</sub> = m̂(v, X) + 1{D = v}·(y − m̂(v, X)) / p̂(v | X), com m̂ por Random Forest em ajuste cruzado e p̂ pela frequência do nível entre as parcelas com os mesmos demais fatores; a média de ψ<sub>v</sub> é o valor da curva e o erro-padrão é o desvio-padrão de ψ<sub>v</sub> / √n. A curva é comparada com as médias marginais da ANOVA.`);
        if (res.conjunto) passos.push(`<b>Comparação entre dosadores.</b> O dosador entra como mais um fator, em nova ANOVA e novo RF+SHAP, usando apenas os tratamentos presentes em todos os dosadores${res.conjunto.excluidos ? ` (${res.conjunto.excluidos} parcelas ficaram de fora)` : ''}.`);
        passos.push(`<b>Gráficos.</b> Mapas de calor com a escala ${esc(Graficos.PRESETS[estado.escala.preset]?.nome || 'personalizada')} (paradas: ${estado.escala.paradas.map(([v]) => f1(v, 0)).join(', ')}), interpolação linear entre paradas; em respostas em que menor é melhor, as cores são invertidas. SHAP e diferença RF − ANOVA usam a escala divergente ${esc(Graficos.PRESETS_DIV[estado.escalaDiv.preset]?.nome || 'personalizada')}, centrada em zero.`);
        passos.push('<b>Software.</b> Comparador de Dosadores (aplicação web executada no navegador), com distribuições F, t, normal e da amplitude estudentizada da biblioteca jStat; ANOVA, Tukey e pressupostos conferidos com statsmodels e scipy nos dados de Andrade.');
        const regras = ['Cada repetição de um arquivo é uma parcela; a resposta é calculada por parcela, nunca por semente.', 'A ANOVA usa todos os fatores com mais de um nível e todas as interações; Tukey e desdobramentos usam o QM do erro do modelo completo.', 'O Random Forest usa a mesma resposta da ANOVA, valida deixando tratamentos inteiros de fora e mede importância por permutação; o SHAP é exato e mostra as interações.', 'A referência agronômica é obrigatória e entra no cálculo de cada resposta.', 'Na comparação entre dosadores, entram só os tratamentos presentes em todos eles.', 'Os cálculos rodam no navegador, sem envio dos dados para servidores.'];
        return `<section class="bloco"><h2>2. Metodologia</h2><p><b>Regras gerais da ferramenta:</b></p><ul>${regras.map((x) => `<li>${x}</li>`).join('')}</ul><p>Os resultados das seções seguintes foram gerados nesta ordem:</p><ol class="metodo">${passos.map((x) => `<li>${x}</li>`).join('')}</ol></section>`;
    }

    const REFS = `<section class="bloco"><h2>Referências</h2><ul class="refs">
        <li>ANDRADE, Henrique Gonçalves. <i>Efeito de velocidade, inclinação longitudinal e sistema de condução de sementes em dosadores pneumáticos</i>. Dissertação (Mestrado em Agronomia) – Faculdade de Agronomia Eliseu Maciel, Universidade Federal de Pelotas, Pelotas, 2026.</li>
        <li>BREIMAN, L. Random forests. <i>Machine Learning</i>, v. 45, p. 5–32, 2001.</li>
        <li>CHERNOZHUKOV, V.; CHETVERIKOV, D.; DEMIRER, M.; DUFLO, E.; HANSEN, C.; NEWEY, W.; ROBINS, J. Double/debiased machine learning for treatment and structural parameters. <i>The Econometrics Journal</i>, v. 21, n. 1, p. C1–C68, 2018.</li>
        <li>COELHO, J. L. D. Ensaio e certificação de máquinas para a semeadura. In: MIALHE, L. G. <i>Máquinas agrícolas: ensaio e certificação</i>. Piracicaba: FEALQ, 1996. p. 55–70.</li>
        <li>ESTECHE, Rafael dos Santos. <i>Aplicação de técnicas de inteligência artificial para verificar influência na qualidade de semeadura de precisão</i>. Trabalho de Conclusão de Curso (Engenharia Eletrônica) – Universidade Federal de Pelotas, Pelotas, 2024.</li>
        <li>INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. <i>ISO 5690-2:1984 — Equipment for distributing fertilizers — Test methods — Part 2: Fertilizer distributors in lines</i>. Genebra: ISO, 1984.</li>
        <li>LUNDBERG, S. M.; LEE, S.-I. A unified approach to interpreting model predictions. In: <i>Advances in Neural Information Processing Systems 30</i>. 2017. p. 4765–4774.</li>
        <li>RASMUSSEN, C. E.; WILLIAMS, C. K. I. <i>Gaussian processes for machine learning</i>. Cambridge: MIT Press, 2006.</li>
        </ul></section>`;

    /** Endereço do app, coautores na geração dos dados e pedido de citação (sempre no relatório). */
    const LINK_APP = 'https://marlonsigales.github.io/app-compara-dosadores/index.html';
    const DESENVOLVEDOR = 'Marlon Soares Sigales e Ádamo de Sousa Araújo';
    const COAUTORES_PROJETO = ['Ângelo Vieira dos Reis', 'Rafael dos Santos Esteche', 'Jean Carlos Scheunemann', 'Henrique Gonçalves Andrade', 'Matheus Albarracin Caselatto', 'Roger Toscan Spagnolo', 'Eduardo Walker', 'Fabrício Ardais Medeiros', 'Giusepe Stefanello'];
    const COAUTORES = ['Marlon Soares Sigales', 'Ângelo Vieira dos Reis', 'Rafael dos Santos Esteche', 'Jean Carlos Scheunemann', 'Henrique Gonçalves Andrade', 'Matheus Albarracin Caselatto', 'Giusepe Stefanello'];
    const CITACAO = 'SIGALES, Marlon Soares; ARAÚJO, Ádamo de Sousa; SPAGNOLO, Roger Toscan; WALKER, Eduardo; MEDEIROS, Fabrício Ardais; REIS, Ângelo Vieira dos; ESTECHE, Rafael dos Santos; SCHEUNEMANN, Jean Carlos; ANDRADE, Henrique Gonçalves; CASELATTO, Matheus Albarracin; STEFANELLO, Giusepe. <i>Comparador de Dosadores</i>: análise de ensaios de dosadores de sementes e adubo por ANOVA e Random Forest + SHAP. Pelotas: Laboratório de Instrumentação Agrícola, Universidade Federal de Pelotas, 2026. Aplicativo web. Disponível em: ' + LINK_APP + '.';
    /** Os dados de exemplo (ensaios de Andrade) têm coautores na geração e coleta; só aparecem quando o exemplo é usado. */
    const usaExemplo = (estado) => estado.dosadores.some((d) => d.exemplo);
    function blocoCreditos(estado) {
        const hoje = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ de /g, ' ');
        return `<div class="creditos"><p><b>Ferramenta:</b> Comparador de Dosadores — <a href="${LINK_APP}">${LINK_APP}</a></p>
        <p><b>Equipe de desenvolvimento:</b> ${esc(DESENVOLVEDOR)} · <b>Coautores do projeto:</b> ${COAUTORES_PROJETO.map(esc).join(', ')}.</p>
        ${usaExemplo(estado) ? `<p><b>Coautores na geração e coleta dos dados de exemplo:</b> ${COAUTORES.map(esc).join(', ')}.</p>` : ''}
        <p><b>Como citar:</b> ao usar resultados gerados por esta ferramenta, cite-a como: ${CITACAO} Acesso em: ${esc(hoje)}.</p>
        <p><b>Anexo:</b> solicitamos que este relatório completo seja incluído como anexo nos trabalhos (artigos, TCC, dissertações, teses e relatórios técnicos) que usarem seus resultados.</p></div>`;
    }

    function documento(ctx) {
        const { res, estado } = ctx;
        let n = 3;
        let h = `<header class="rel-cab"><h1>${esc(estado.projeto.titulo || 'Comparação de dosadores')}</h1><p>${esc(estado.projeto.responsavel || '')}${estado.projeto.responsavel ? ' · ' : ''}gerado em ${new Date(res.quando).toLocaleString('pt-BR')}</p>${blocoCreditos(estado)}</header>`;
        h += secaoDados(ctx);
        h += secaoMetodologia(ctx);
        for (const b of res.porDosador) h += secaoBloco(b, `Dosador ${b.nome}`, ctx, n++);
        if (res.conjunto) h += secaoBloco(res.conjunto, 'Comparação entre dosadores', ctx, n++);
        return h + REFS + `<section class="bloco"><h2>Como citar esta ferramenta</h2>${blocoCreditos(estado)}</section>`;
    }

    /** HTML autônomo (para baixar). */
    function htmlAutonomo(ctx, css) {
        return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(ctx.estado.projeto.titulo || 'Relatório — Comparador de Dosadores')}</title><style>${css}</style></head><body class="relatorio-solo"><main class="relatorio">${documento(ctx)}<footer class="rel-rodape">Comparador de Dosadores — ${LINK_APP} · Equipe de desenvolvimento: ${DESENVOLVEDOR} · Coautores do projeto: ${COAUTORES_PROJETO.map(esc).join(', ')} ·${usaExemplo(ctx.estado) ? ` Coautores na geração e coleta dos dados de exemplo: ${COAUTORES.map(esc).join(', ')} ·` : ''} Inclua este relatório como anexo dos trabalhos que usarem seus resultados · Laboratório de Instrumentação Agrícola · UFPel</footer></main></body></html>`;
    }

    return { documento, htmlAutonomo, secaoBloco, tabelaAnova, pressupostos, tabelaTukey, tabelaDesdobramento, tabelaRF, htmlCurva, mapaResposta, mapaRF, mapaDiferenca, mapaErro, mapasErro, mapasShap, curvasVelocidade, barrasComparativo, conclusoes, respNome };
})();

if (typeof module !== 'undefined') module.exports = Relatorio;
