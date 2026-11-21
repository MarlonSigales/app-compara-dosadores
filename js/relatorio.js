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
    const CURTOS = { A: 'Aceitáveis (%)', F: 'Falhos (%)', M: 'Múltiplos (%)', CVA: 'CV dos aceitáveis (%)', CV: 'CV (%)', media: 'Massa (g)' };
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

    /** Escala para a resposta: em F, M e CV (menor é melhor) as cores se invertem e vão de 0 a um máximo. */
    function escalaPara(cfgEsc, resposta) {
        const menorMelhor = ['F', 'M', 'CVA', 'CV'].includes(resposta);
        if (!menorMelhor) return { paradas: cfgEsc.paradas, cor: G.escala(cfgEsc.paradas) };
        const p = [...cfgEsc.paradas].sort((a, b) => a[0] - b[0]);
        const v0 = p[0][0], v1 = p[p.length - 1][0];
        const vmax = cfgEsc.maxInvertida || ((resposta === 'CV' || resposta === 'CVA') ? 60 : 30);
        const paradas = p.map(([v, c]) => [vmax * (v1 - v) / (v1 - v0), c]).sort((a, b) => a[0] - b[0]);
        return { paradas, cor: G.escala(paradas) };
    }

    function mapaResposta(bloco, cfgEsc, resposta, rotulo, comMarcas, limite) {
        const e = escalaPara(cfgEsc, resposta);
        const menorMelhor = ['F', 'M', 'CVA', 'CV'].includes(resposta);
        const { ps, eixoX } = paineis(bloco.icOrig || bloco.ic, bloco.fatores, (c) => c.media,
            comMarcas ? (c) => (menorMelhor ? c.lo > limite : c.hi < limite) : null,
            (c) => `${c.niveis.map((v, i) => `${A.nomeCurto(bloco.fatores[i])} ${A.rotNivel(bloco.fatores[i], v)}`).join(' · ')}: ${f1(c.media, 1)} (IC95% ${f1(c.lo, 1)} a ${f1(c.hi, 1)})`);
        return G.mapas(ps, { cor: e.cor, paradas: e.paradas, esticada: cfgEsc.esticada, rotuloBarra: rotCurto(resposta), eixoX, colunas: Math.min(3, ps.length) });
    }

    function mapaRF(rf, fatores, cfgEsc, resposta, rotulo) {
        const e = escalaPara(cfgEsc, resposta);
        const cel = rf.trat.map((t) => ({ niveis: fatores.map((f) => t[f]), v: t.predCV, m: t.media }));
        const { ps, eixoX } = paineis(cel, fatores, (c) => c.v, null, (c) => `previsto ${f1(c.v, 1)} · observado ${f1(c.m, 1)}`);
        return G.mapas(ps, { cor: e.cor, paradas: e.paradas, esticada: cfgEsc.esticada, rotuloBarra: rotCurto(resposta), eixoX, colunas: Math.min(3, ps.length) });
    }

    function mapaDiferenca(rf, fatores, cfgDiv) {
        const cel = rf.trat.map((t) => ({ niveis: fatores.map((f) => t[f]), v: t.predCV - t.media }));
        const lim = Math.min(Math.max(5, Math.ceil(Math.max(...cel.map((c) => Math.abs(c.v))) / 5) * 5), 20);
        const paradas = cfgDiv.paradas.map(([v, c]) => [v * lim, c]);
        const { ps, eixoX } = paineis(cel, fatores, (c) => c.v, null, (c) => `RF − ANOVA: ${f1(c.v, 1)} p.p.`);
        return G.mapas(ps, { cor: G.escala(paradas), paradas, esticada: false, rotuloBarra: 'RF − ANOVA (p.p.)', eixoX, colunas: Math.min(3, ps.length), formatoBarra: (v) => f1(v, 0) });
    }

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
        <tr><td>Maior erro por tratamento</td><td>${f1(rf.maxErroCelula, 2)} p.p.</td></tr>
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
        const ord = [...(bloco.icOrig || bloco.ic)].sort((a, b) => b.media - a.media);
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
        h += `<figure>${mapaResposta(bloco, ctx.escala, res.resposta, rotOrig, false, limite)}<figcaption>${esc(rotOrig)} por tratamento (média das repetições).</figcaption></figure>`;
        h += `<h3>${num}.3 ANOVA (${esc(rot)})</h3>${tabelaAnova(bloco.an, a.alfa)}`;
        h += `<h4>Pressupostos</h4>${pressupostos(bloco)}`;
        h += `<h4>Teste de Tukey — efeitos principais</h4><div class="grade-tabs">${bloco.tukeyPrincipais.map((t) => `<div>${tabelaTukey(t, t.fator)}</div>`).join('')}</div>`;
        if (bloco.desdobramentos.length) {
            h += '<h4>Desdobramentos das interações significativas</h4>';
            for (const d of bloco.desdobramentos) h += `<h5>${esc(A.nomeFator(d.fator))} dentro de ${esc(d.dentro.map(A.nomeFator).join(' × '))} (interação ${esc(A.nomeTermo(d.termo))})</h5>${tabelaDesdobramento(d)}`;
        }
        const marcas = res.resposta === 'A';
        h += `<figure>${mapaResposta(bloco, ctx.escala, res.resposta, rotOrig + ' — média ANOVA', marcas, limite)}<figcaption>Médias de tratamento da ANOVA${marcas && res.resposta === 'A' ? `. Ponto: intervalo de confiança de 95% (QM do erro, ${bloco.an.erro.gl} GL) inteiro abaixo de ${f1(limite, 0)}%` : ''}.</figcaption></figure>`;
        if (bloco.sig?.length) {
            h += `<h4>Ajuste sigmoidal (como em Andrade)</h4>${tabelaSigmoide(bloco.sig)}`;
            h += `<figure>${graficoSigmoide(bloco.sig.filter((s) => s.niveis.some((v) => v === 0) || bloco.sig.length <= 6).slice(0, 6), rotOrig, res.resposta === 'A' ? limite : null)}<figcaption>Ajuste sigmoidal${bloco.sig.length > 6 ? ' (combinações com ângulo 0°)' : ''}.</figcaption></figure>`;
        }
        h += `<h3>${num}.4 Random Forest + SHAP (proposta)</h3>`;
        h += `<p>Mesma resposta da ANOVA (${esc(rotOrig)}, por parcela), cada fator como um único jogador, validação agrupada por tratamento (${a.folds} grupos; o modelo não vê nenhuma repetição do tratamento previsto), importância por permutação e SHAP exato com interações.</p>`;
        h += tabelaRF(bloco.rf);
        h += `<figure>${barrasComparativo(bloco.comp, titulo)}<figcaption>Parcela de cada efeito no total explicado: ANOVA × SHAP (efeitos principais e pares).</figcaption></figure>`;
        h += `<figure>${mapaRF(bloco.rf, bloco.fatores, ctx.escala, res.resposta, rotOrig + ' — previsão RF')}<figcaption>Previsão do RF para tratamentos deixados de fora do treino.</figcaption></figure>`;
        h += `<figure>${mapaDiferenca(bloco.rf, bloco.fatores, ctx.escalaDiv)}<figcaption>Diferença entre a previsão do RF e a média observada (p.p.). Erros grandes nas bordas indicam que o RF não extrapola.</figcaption></figure>`;
        for (const m of mapasShap(bloco.rf, bloco.fatores, ctx.escalaDiv)) h += `<figure>${m.svg}<figcaption>Contribuição SHAP de ${esc(A.nomeFator(m.fator).toLowerCase())} em cada tratamento, em relação à média do modelo (${f1(bloco.rf.base, 1)}).</figcaption></figure>`;
        h += `<details class="apendice"><summary>Médias de todas as respostas por tratamento</summary>${tabelaDescritiva(bloco.desc, unidade)}</details>`;
        return h + '</section>';
    }

    function secaoMetodo(ctx) {
        const { estado, res } = ctx;
        const a = estado.analise;
        const linhasDos = estado.dosadores.map((d) => `<tr><td>${esc(d.nome)}</td><td>${esc([d.marca, d.modelo].filter(Boolean).join(' '))}</td><td>${esc(d.produto === 'adubo' ? 'Adubo' : 'Sementes')}${d.semente ? ' — ' + esc(d.semente) : ''}</td><td>${esc(Dados.TIPOS_DOSADOR[d.tipo]?.rotulo || '')}</td><td>${esc(d.tubo || '—')}</td><td>${esc(Dados.UNIDADES[d.unidade].rotulo)}</td><td>${Dados.UNIDADES[d.unidade].tipo === 'massa' ? '—' : f1(d.xref, 3) + ' m'}</td><td>${d.arquivos.length}</td></tr>`).join('');
        const papeis = estado.padrao.papeis.map((p, i) => `${i + 1}ª parte = ${esc(p === 'outro' ? (estado.padrao.nomesOutros?.[i] || 'outro fator') : (Dados.PAPEIS[p] || '—'))}`).join('; ');
        return `<section class="bloco"><h2>1. Dados e método</h2>
        <table class="tab"><thead><tr><th>Nome</th><th>Marca e modelo</th><th>Produto</th><th>Tipo</th><th>Tubo condutor</th><th>Dado bruto</th><th>X<sub>ref</sub></th><th>Arquivos</th></tr></thead><tbody>${linhasDos}</tbody></table>
        <p>Nome dos arquivos: ${papeis}. Parcelas analisadas: ${res.nParcelas}${a.igualarRepeticoes ? ` (${res.minReps} repetições por tratamento, as primeiras de cada arquivo, para manter o delineamento balanceado)` : ''}.</p>
        <p><b>Classificação dos espaçamentos (Coelho, 1996):</b> múltiplos X<sub>i</sub> &lt; 0,5·X<sub>ref</sub>; aceitáveis 0,5·X<sub>ref</sub> ≤ X<sub>i</sub> ≤ 1,5·X<sub>ref</sub>; falhos X<sub>i</sub> &gt; 1,5·X<sub>ref</sub>. Com dados em tempo, X<sub>ref</sub> vira T<sub>ref</sub> = 3,6·X<sub>ref</sub>/V (s, com X<sub>ref</sub> em m e V em km/h). Limite de desempenho: ${f1(ctx.limite, 0)}% de aceitáveis.</p>
        <p><b>ANOVA:</b> delineamento inteiramente casualizado em fatorial completo, com todas as interações; teste F a ${f1(a.alfa * 100, 0)}%; Tukey para efeitos principais e desdobramento das interações significativas, sempre com o QM do erro do modelo completo; pressupostos por Shapiro-Wilk e Levene (Brown-Forsythe)${res.transformado ? '; resposta transformada por arcsen√p' : ''}.</p>
        <p><b>Random Forest + SHAP (proposta):</b> ${a.arvores} árvores de regressão sobre a mesma resposta por parcela; condução como uma coluna 0/1, ângulos e velocidade numéricos e dosador em colunas agrupadas; validação cruzada agrupada por tratamento; importância por permutação; SHAP exato intervencional (fundo = tratamentos observados) com interações de pares.</p></section>`;
    }

    const REFS = `<section class="bloco"><h2>Referências</h2><ul class="refs">
        <li>ANDRADE, Henrique Gonçalves. <i>Efeito de velocidade, inclinação longitudinal e sistema de condução de sementes em dosadores pneumáticos</i>. Dissertação (Mestrado em Agronomia) – Faculdade de Agronomia Eliseu Maciel, Universidade Federal de Pelotas, Pelotas, 2026.</li>
        <li>BREIMAN, L. Random forests. <i>Machine Learning</i>, v. 45, p. 5–32, 2001.</li>
        <li>COELHO, J. L. D. Ensaio e certificação de máquinas para a semeadura. In: MIALHE, L. G. <i>Máquinas agrícolas: ensaio e certificação</i>. Piracicaba: FEALQ, 1996. p. 55–70.</li>
        <li>ESTECHE, Rafael dos Santos. <i>Aplicação de técnicas de inteligência artificial para verificar influência na qualidade de semeadura de precisão</i>. Trabalho de Conclusão de Curso (Engenharia Eletrônica) – Universidade Federal de Pelotas, Pelotas, 2024.</li>
        <li>LUNDBERG, S. M.; LEE, S.-I. A unified approach to interpreting model predictions. In: <i>Advances in Neural Information Processing Systems 30</i>. 2017. p. 4765–4774.</li>
        </ul></section>`;

    function documento(ctx) {
        const { res, estado } = ctx;
        let n = 2;
        let h = `<header class="rel-cab"><h1>${esc(estado.projeto.titulo || 'Comparação de dosadores')}</h1><p>${esc(estado.projeto.responsavel || '')}${estado.projeto.responsavel ? ' · ' : ''}gerado em ${new Date(res.quando).toLocaleString('pt-BR')}</p></header>`;
        h += secaoMetodo(ctx);
        for (const b of res.porDosador) h += secaoBloco(b, `Dosador ${b.nome}`, ctx, n++);
        if (res.conjunto) h += secaoBloco(res.conjunto, 'Comparação entre dosadores', ctx, n++);
        return h + REFS;
    }

    /** HTML autônomo (para baixar). */
    function htmlAutonomo(ctx, css) {
        return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(ctx.estado.projeto.titulo || 'Relatório — Comparador de Dosadores')}</title><style>${css}</style></head><body class="relatorio-solo"><main class="relatorio">${documento(ctx)}<footer class="rel-rodape">Comparador de Dosadores — Marlon Soares Sigales · Laboratório de Instrumentação Agrícola · Engenharia Agrícola · CEng/UFPel</footer></main></body></html>`;
    }

    return { documento, htmlAutonomo, secaoBloco, tabelaAnova, pressupostos, tabelaTukey, tabelaDesdobramento, tabelaRF, mapaResposta, mapaRF, mapaDiferenca, mapasShap, curvasVelocidade, barrasComparativo, conclusoes, respNome };
})();

if (typeof module !== 'undefined') module.exports = Relatorio;
