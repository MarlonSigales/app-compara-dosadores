/**
 * © 2026 Comparador de Dosadores — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Orquestra as análises: parcelas → ANOVA fatorial completa, pressupostos, Tukey e desdobramentos (como Andrade),
 * ajuste sigmoidal, e a versão proposta de RF+SHAP com a mesma resposta. Também compara os dosadores entre si.
 */
'use strict';

const Analise = (() => {
    const E = (typeof Estat !== 'undefined') ? Estat : require('./estatistica.js');
    const F = (typeof Floresta !== 'undefined') ? Floresta : require('./floresta.js');
    const D = (typeof Dados !== 'undefined') ? Dados : require('./dados.js');
    const S = (typeof Superficie !== 'undefined') ? Superficie : require('./superficie.js');

    const ORDEM = ['dosador', 'cond', 'long', 'lat', 'vel'];
    const NOMES = { dosador: 'Dosador', cond: 'Condução', long: 'Inclinação longitudinal', lat: 'Inclinação lateral', vel: 'Velocidade' };
    const CURTOS = { dosador: 'Dos', cond: 'Cond', long: 'Long', lat: 'Lat', vel: 'Vel' };
    const nomeFator = (f) => NOMES[f] || f;
    const nomeCurto = (f) => CURTOS[f] || f;
    const nomeTermo = (fs) => fs.map(nomeCurto).join(' × ');
    const rotNivel = (f, v) => (f === 'long' || f === 'lat' ? `${v}°` : (f === 'vel' ? `${v}` : String(v)));
    const pausa = () => new Promise((r) => setTimeout(r, 0));

    function fatoresPresentes(rows, candidatos) {
        return candidatos.filter((f) => rows.some((r) => r[f] !== undefined) && E.niveisDe(rows, f).length > 1);
    }

    /** Aplica o recorte de níveis escolhido pelo usuário (ex.: mínimos, médios e máximos como Andrade). */
    function recortar(rows, recorte) {
        if (!recorte) return rows;
        return rows.filter((r) => Object.entries(recorte).every(([f, lv]) => !lv || !lv.length || lv.map(String).includes(String(r[f]))));
    }

    /** ANOVA + pressupostos + Tukey + desdobramentos + IC de cada tratamento para um conjunto de parcelas. */
    function blocoAnova(rows, fatores, y, cfg) {
        const an = E.anova(rows, fatores, y);
        const fat = an.fatores;
        const alfa = cfg.alfa;
        const sw = E.shapiroWilk(an.residuos);
        const lv = E.levene(rows, fat, y);
        const tukeyPrincipais = fat.map((f) => {
            const t = an.tabela.find((x) => x.fatores.length === 1 && x.fatores[0] === f);
            const ms = E.mediasMarginais(rows, [f], y).map((m) => ({ ...m, rotulo: rotNivel(f, m.niveis[0]) }));
            return { fator: f, significativo: t.p < alfa, p: t.p, ...E.tukey(ms, an.erro.qm, an.erro.gl, alfa) };
        });
        const desdobramentos = [];
        for (const t of an.tabela.filter((x) => x.fatores.length >= 2 && x.p < alfa)) {
            for (const f of t.fatores) {
                const dentro = t.fatores.filter((g) => g !== f);
                const nGrupos = dentro.reduce((p, g) => p * an.niveis[g].length, 1);
                if (nGrupos > (cfg.maxGruposDesdobramento || 40)) { desdobramentos.push({ termo: t.fatores, fator: f, dentro, omitido: true, nGrupos }); continue; }
                const res = E.desdobrar(rows, f, dentro, y, an.erro.qm, an.erro.gl, alfa).map((g) => ({
                    ...g,
                    dentroRot: g.dentro.split(' · ').map((v, i) => `${nomeCurto(dentro[i])} ${rotNivel(dentro[i], isNaN(+v) ? v : +v)}`).join(' · '),
                    medias: g.medias.map((m) => ({ ...m, rotulo: rotNivel(f, isNaN(+m.rotulo) ? m.rotulo : +m.rotulo) }))
                }));
                desdobramentos.push({ termo: t.fatores, fator: f, dentro, grupos: res });
            }
        }
        const ic = E.icMedias(an, alfa).map((c) => ({ ...c, fatores: fat }));
        return { an, sw, lv, tukeyPrincipais, desdobramentos, ic };
    }

    /** Ajuste sigmoidal (resposta × velocidade) em cada combinação dos outros fatores, como Andrade fez em 0°. */
    function sigmoides(rows, fatores, y) {
        if (!fatores.includes('vel')) return [];
        const outros = fatores.filter((f) => f !== 'vel' && f !== 'dosador');
        const grupos = new Map();
        for (const r of rows) {
            const k = outros.map((f) => r[f]).join('|');
            if (!grupos.has(k)) grupos.set(k, { niveis: outros.map((f) => r[f]), pts: new Map() });
            const g = grupos.get(k).pts;
            if (!g.has(r.vel)) g.set(r.vel, []);
            g.get(r.vel).push(r[y]);
        }
        const out = [];
        for (const g of grupos.values()) {
            const xs = [...g.pts.keys()].sort((a, b) => a - b);
            if (xs.length < 4) continue;
            const ys = xs.map((x) => E.media(g.pts.get(x)));
            const s = E.sigmoide(xs, ys);
            out.push({ rotulo: g.niveis.map((v, i) => `${nomeCurto(outros[i])} ${rotNivel(outros[i], v)}`).join(' · '), niveis: g.niveis, xs, ys, ...s });
        }
        return out;
    }

    /** RF+SHAP proposto (por parcela, CV agrupada, permutação, SHAP exato com interações). */
    async function blocoRF(rows, fatores, y, cfg, progresso) {
        const niveis = Object.fromEntries(fatores.map((f) => [f, E.niveisDe(rows, f)]));
        const cod = F.codificar(rows, fatores, niveis);
        const yv = rows.map((r) => r[y]);
        const opc = { arvores: cfg.arvores, minFolha: cfg.minFolha };
        const modelo = F.treinar(cod.X, yv, { ...opc, semente: 1 });
        await pausa();
        const pred = await F.cvAgrupada(rows, fatores, y, cod, { ...opc, arvores: Math.max(50, Math.round(cfg.arvores / 2)) }, cfg.folds, progresso);
        const imp = F.importanciaPermutacao(modelo, cod.X, yv, cod.jogadores, cfg.repeticoesPermutacao || 5);
        const tratMap = new Map();
        rows.forEach((r, i) => {
            const k = fatores.map((f) => r[f]).join('|');
            if (!tratMap.has(k)) tratMap.set(k, { ...Object.fromEntries(fatores.map((f) => [f, r[f]])), soma: 0, n: 0, somaPred: 0 });
            const o = tratMap.get(k); o.soma += r[y]; o.somaPred += pred[i]; o.n++;
        });
        const trat = [...tratMap.values()].map((o) => ({ ...o, media: o.soma / o.n, predCV: o.somaPred / o.n }));
        await pausa();
        const sh = F.shap(modelo, cod, trat, fatores);
        // erros por tratamento: fora da amostra (validação agrupada) e do modelo completo que o SHAP explica (base + Σφ)
        trat.forEach((t, i) => { t.predSHAP = sh[i].previsao; t.erroCV = t.predCV - t.media; t.erroSHAP = t.predSHAP - t.media; });
        const M = cod.jogadores.length;
        const absPhi = cod.jogadores.map((_, i) => E.media(sh.map((o) => Math.abs(o.phi[i]))));
        const absMain = cod.jogadores.map((_, i) => E.media(sh.map((o) => Math.abs(o.inter[i][i]))));
        const pares = [];
        for (let i = 0; i < M; i++) for (let j = i + 1; j < M; j++) pares.push({ fatores: [cod.jogadores[i].fator, cod.jogadores[j].fator], valor: 2 * E.media(sh.map((o) => Math.abs(o.inter[i][j]))) });
        const erroCel = trat.map((t) => Math.abs(t.predCV - t.media));
        return {
            fatores, jogadores: cod.jogadores.map((j) => j.fator), r2cv: F.r2(yv, pred), r2treino: F.r2(yv, cod.X.map(modelo.prever)),
            importancia: imp, absPhi, absMain, pares, shap: sh, trat, base: sh[0]?.base,
            maeCelula: E.media(erroCel), maxErroCelula: Math.max(...erroCel),
            rmseCelula: Math.sqrt(E.media(trat.map((t) => t.erroCV ** 2))),
            maeSHAP: E.media(trat.map((t) => Math.abs(t.erroSHAP))), maxErroSHAP: Math.max(...trat.map((t) => Math.abs(t.erroSHAP))),
            rmseSHAP: Math.sqrt(E.media(trat.map((t) => t.erroSHAP ** 2)))
        };
    }

    /**
     * Curva do processo: superfície contínua (GP) sobre as médias dos tratamentos da resposta original, com o ruído
     * de cada média dado pelo QM do erro da ANOVA; e DML (modelo parcialmente linear e curva AIPW de cada fator).
     */
    async function blocoCurva(rows, fatores, y, an, cfg, pausa) {
        const niveis = Object.fromEntries(fatores.map((f) => [f, E.niveisDe(rows, f)]));
        const out = { fatores, niveis };
        const numericos = fatores.filter((f) => niveis[f].every((v) => typeof v === 'number'));
        if (cfg.superficie && numericos.length) {
            const cel = [...an.celulas.values()].map((c) => ({ niveis: c.niveis, media: c.media, n: c.n }));
            out.gp = S.ajustarGP(cel, an.fatores, Object.fromEntries(an.fatores.map((f) => [f, an.niveis[f]])), an.erro.qm);
            out.xF = numericos.includes('vel') ? 'vel' : numericos[0];
            out.linF = ['long', 'lat'].find((f) => numericos.includes(f) && f !== out.xF) || numericos.find((f) => f !== out.xF) || null;
            await pausa();
        }
        if (cfg.dml) {
            const opc = { folds: cfg.dmlFolds || 5, arvores: cfg.dmlArvores || 60 };
            out.plr = [];
            out.curvas = [];
            for (const f of fatores) {
                out.plr.push(await S.dmlPLR(rows, fatores, niveis, y, f, opc, pausa));
                const cur = await S.dmlCurva(rows, fatores, niveis, y, f, opc, pausa);
                const mm = E.mediasMarginais(rows, [f], y);
                cur.forEach((c) => { c.anova = mm.find((m) => m.niveis[0] === c.nivel)?.media; });
                out.curvas.push({ fator: f, pontos: cur, maxDif: Math.max(...cur.map((c) => Math.abs(c.media - c.anova))) });
            }
        }
        return out;
    }

    /** Parcela de cada termo no total (ANOVA: SQ; SHAP: |valor| médio), para efeitos principais e pares. */
    function comparativo(an, rf) {
        const termos = an.tabela.filter((t) => t.fatores.length <= 2);
        const sqTot = termos.reduce((s, t) => s + t.sq, 0);
        const shapDe = (fs) => {
            if (fs.length === 1) return rf.absMain[rf.jogadores.indexOf(fs[0])];
            const p = rf.pares.find((q) => q.fatores.includes(fs[0]) && q.fatores.includes(fs[1]));
            return p ? p.valor : 0;
        };
        const shTot = termos.reduce((s, t) => s + shapDe(t.fatores), 0);
        return termos.map((t) => ({ termo: t.fatores, nome: nomeTermo(t.fatores), anova: 100 * t.sq / sqTot, shap: 100 * shapDe(t.fatores) / shTot }));
    }

    /** Executa tudo a partir do estado do projeto. */
    async function executar(estado, progresso = async () => {}) {
        const a = estado.analise;
        const outros = {};
        estado.padrao.papeis.forEach((p, i) => { if (p === 'outro') outros[i] = estado.padrao.nomesOutros?.[i] || `Fator ${i + 1}`; });
        const minReps = Math.min(...estado.dosadores.flatMap((d) => d.arquivos.map((f) => f.reps.length)));
        let rows = D.parcelas(estado.dosadores, estado.padrao.papeis, outros, { repeticoes: a.igualarRepeticoes ? minReps : null, descartarPrimeiro: a.descartarPrimeiro });
        rows = recortar(rows, a.recorte);
        let y = a.resposta;
        const ehPct = ['A', 'F', 'M'].includes(y);
        if (a.transformacao === 'arcoseno' && ehPct) { rows.forEach((r) => { r[y + '_t'] = E.arcoSeno(r[y]); }); y = y + '_t'; }
        const candidatos = ['cond', 'long', 'lat', 'vel', ...Object.values(outros)];
        const cfg = { alfa: a.alfa, arvores: a.arvores, folds: a.folds, minFolha: 2, maxGruposDesdobramento: a.maxGrupos || 40 };
        const nomesDos = estado.dosadores.map((d) => d.nome);
        const porDosador = [];
        let passo = 0;
        const total = nomesDos.length * 2 + (nomesDos.length > 1 ? 2 : 0);
        for (const nome of nomesDos) {
            const rd = rows.filter((r) => r.dosador === nome);
            const fat = fatoresPresentes(rd, candidatos);
            await progresso(++passo / total, `ANOVA — ${nome}`);
            const bloco = blocoAnova(rd, fat, y, cfg);
            if (y !== a.resposta) bloco.icOrig = E.icMedias(E.anova(rd, bloco.an.fatores, a.resposta), a.alfa).map((c) => ({ ...c, fatores: bloco.an.fatores }));
            const desc = descritiva(rd, fat);
            const sig = sigmoides(rd, fat, a.resposta);
            await progresso(++passo / total, `Random Forest + SHAP — ${nome}`);
            const rf = await blocoRF(rd, bloco.an.fatores, a.resposta, cfg, (t) => progresso((passo - 1 + t) / total, `Random Forest + SHAP — ${nome}`));
            let curva = null;
            if (a.superficie !== false || a.dml !== false) {
                await progresso((passo - 0.2) / total, `Curva do processo (superfície contínua e DML) — ${nome}`);
                const anOrig = y === a.resposta ? bloco.an : E.anova(rd, bloco.an.fatores, a.resposta);
                curva = await blocoCurva(rd, bloco.an.fatores, a.resposta, anOrig, { superficie: a.superficie !== false, dml: a.dml !== false }, pausa);
            }
            const dos = estado.dosadores.find((d) => d.nome === nome);
            porDosador.push({ nome, dosador: dos, rows: rd, fatores: bloco.an.fatores, ...bloco, desc, sig, rf, curva, comp: comparativo(bloco.an, rf) });
        }
        let conjunto = null;
        if (nomesDos.length > 1) {
            // só os tratamentos que existem em todos os dosadores
            const fat = fatoresPresentes(rows, candidatos);
            const chaveT = (r) => fat.map((f) => r[f]).join('|');
            const porT = new Map();
            for (const r of rows) { const k = chaveT(r); if (!porT.has(k)) porT.set(k, new Set()); porT.get(k).add(r.dosador); }
            const comuns = new Set([...porT.entries()].filter(([, s]) => s.size === nomesDos.length).map(([k]) => k));
            const rc = rows.filter((r) => comuns.has(chaveT(r)));
            const excluidos = rows.length - rc.length;
            await progresso(++passo / total, 'ANOVA — comparação entre dosadores');
            const bloco = blocoAnova(rc, ['dosador', ...fat], y, cfg);
            if (y !== a.resposta) bloco.icOrig = E.icMedias(E.anova(rc, bloco.an.fatores, a.resposta), a.alfa).map((c) => ({ ...c, fatores: bloco.an.fatores }));
            await progresso(++passo / total, 'Random Forest + SHAP — comparação entre dosadores');
            const rf = await blocoRF(rc, bloco.an.fatores, a.resposta, cfg, (t) => progresso((passo - 1 + t) / total, 'Random Forest + SHAP — comparação'));
            conjunto = { rows: rc, excluidos, fatores: bloco.an.fatores, ...bloco, rf, comp: comparativo(bloco.an, rf), desc: descritiva(rc, ['dosador', ...fat]) };
        }
        await progresso(1, 'Pronto');
        return { quando: new Date().toISOString(), resposta: a.resposta, y, transformado: y !== a.resposta, minReps, nParcelas: rows.length, porDosador, conjunto, cfg };
    }

    /** Médias por tratamento de todas as respostas (para as tabelas descritivas). */
    function descritiva(rows, fatores) {
        const ks = Object.keys(rows[0] || {}).filter((k) => ['A', 'F', 'M', 'CVA', 'CV', 'media', 'vazao', 'desvio', 'erroAbs', 'amplitude', 'doseAplicada'].includes(k));
        const g = new Map();
        for (const r of rows) {
            const k = fatores.map((f) => r[f]).join('|');
            if (!g.has(k)) g.set(k, { niveis: fatores.map((f) => r[f]), vals: Object.fromEntries(ks.map((x) => [x, []])) });
            for (const x of ks) g.get(k).vals[x].push(r[x]);
        }
        return { fatores, respostas: ks, linhas: [...g.values()].map((o) => ({ niveis: o.niveis, ...Object.fromEntries(ks.map((x) => [x, E.media(o.vals[x])])) })) };
    }

    return { executar, nomeFator, nomeCurto, nomeTermo, rotNivel, ORDEM, recortar };
})();

if (typeof module !== 'undefined') module.exports = Analise;
