/**
 * © 2026 Comparador de Dosadores — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 * Testes do núcleo (node tests/testes.js). Referências calculadas com statsmodels/scipy sobre os dados de Andrade.
 */
'use strict';
const path = require('path'); const fs = require('fs');
const raiz = path.join(__dirname, '..');
global.jStat = require(path.join(raiz, 'js/vendor/jstat.min.js'));
global.Estat = require(path.join(raiz, 'js/estatistica.js'));
global.Floresta = require(path.join(raiz, 'js/floresta.js'));
global.Dados = require(path.join(raiz, 'js/dados.js'));
const Analise = require(path.join(raiz, 'js/analise.js'));
let ok = 0, falhas = 0;
const t = (nome, cond) => { if (cond) ok++; else { falhas++; console.log('FALHOU:', nome); } };
const perto = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const ler = (f) => { const L = fs.readFileSync(path.join(__dirname, f), 'utf8').trim().split('\n'); const h = L[0].split(','); return L.slice(1).map((l) => { const v = l.split(','); const o = {}; h.forEach((k, i) => { o[k] = isNaN(+v[i]) ? v[i] : +v[i]; }); return o; }); };
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'referencia_statsmodels.json')));
const P = ler('parcelas_ref.csv');
const jd = P.filter((r) => r.marca === 'JD');

// ANOVA balanceada = statsmodels
const an = Estat.anova(jd, ['cond', 'ang', 'vel'], 'A');
const mapa = { cond: 'C(cond)', ang: 'C(ang)', vel: 'C(vel)', 'cond×ang': 'C(cond):C(ang)', 'cond×vel': 'C(cond):C(vel)', 'ang×vel': 'C(ang):C(vel)', 'cond×ang×vel': 'C(cond):C(ang):C(vel)' };
t('ANOVA balanceada detectada', an.balanceado);
for (const r of an.tabela) t(`SQ ${r.nome}`, perto(r.sq, ref.full[mapa[r.nome]], 1e-6));
t('SQ do erro', perto(an.erro.sq, ref.full.Residual, 1e-6));
t('GL do erro = 640', an.erro.gl === 640);

// ANOVA desbalanceada (tipo II) = statsmodels
const du = ler('parcelas_desbal.csv').filter((r) => r.marca === 'JD' && [5, 12, 20].includes(r.vel));
const ab = Estat.anova(du, ['cond', 'ang', 'vel'], 'A');
t('desbalanceado detectado', !ab.balanceado);
for (const r of ab.tabela) t(`SQ tipo II ${r.nome}`, perto(r.sq, ref.unbal[mapa[r.nome]], 1e-5));

// pressupostos = scipy
const sw = Estat.shapiroWilk(Estat.anova(P.filter((r) => r.marca === 'PP'), ['cond', 'ang', 'vel'], 'A').residuos);
t('Shapiro W (PP)', perto(sw.W, ref.shapiroPP[0], 1e-6));
t('Shapiro p (PP)', perto(sw.p, ref.shapiroPP[1], 1e-4));
const lv = Estat.levene(jd, ['cond', 'ang', 'vel'], 'A');
t('Levene F (JD)', perto(lv.F, ref.levene[0], 1e-6));
t('Levene p (JD)', perto(lv.p, ref.levene[1], 1e-3));

// Tukey: valor crítico q(0,95; 3; 72) = 3,3844 (tabela)
t('q crítico de Tukey', perto(jStat.tukey.inv(0.95, 3, 72), 3.3844, 1e-3));
const tk = Estat.tukey(Estat.mediasMarginais(jd, ['cond'], 'A'), an.erro.qm, an.erro.gl);
t('Tukey separa sem/com tubo no JD', tk.medias[0].letras !== tk.medias[1].letras);

// sigmoide recupera parâmetros conhecidos
const xs = [5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20]; const ys = xs.map((x) => 90 / (1 + Math.exp(-(x - 6) / 1.2)));
const sg = Estat.sigmoide(xs, ys);
t('sigmoide a', perto(sg.a, 90, 1e-3)); t('sigmoide x0', perto(sg.x0, 6, 1e-3)); t('sigmoide R²', sg.r2 > 0.9999);

// leitura de CSV e nomes
const csv = 'n,rep1.0,rep2.0\n1,100,120\n2,110,90\n';
t('lerCSV ignora coluna n', Dados.lerCSV(csv).reps.length === 2);
t('sugere papéis com 3 partes', Dados.sugerirPapeis(3, [['c', '-5', '08'], ['s', '11', '20']]).join() === 'cond,long,vel');
t('com 4 partes, os ângulos ficam para o usuário', Dados.sugerirPapeis(4, [['c', '-5', '0', '08'], ['s', '11', '5', '20']]).join() === 'cond,,,vel');
const m = Dados.metricasParcela([250, 250, 100, 400, 260], 'ms', 0.25, 3.6); // Tref = 250 ms
t('classificação A/F/M', m.A === 60 && m.M === 20 && m.F === 20);
const md = Dados.metricasParcela([0.25, 0.1, 0.5], 'm', 0.25, 10);
t('classificação por distância', perto(md.A, 100 / 3, 1e-9));

// referência agronômica e adubo (ISO 5690-2)
const rs = Dados.referenciaAgronomica({ unidade: 'ms', xrefModo: 'populacao', populacao: 80000, espacamento: 0.5 });
t('população 80 mil/ha a 0,5 m → Xref 0,25 m', perto(rs.xref, 0.25, 1e-12));
t('referência obrigatória', !Dados.referenciaAgronomica({ unidade: 'ms', xrefModo: 'xref', xref: null }).ok);
const ra = Dados.referenciaAgronomica({ unidade: 'g', dose: 300, espacamento: 0.5, intervalo: 30 });
t('adubo 300 kg/ha a 0,5 m → 15 g/m', perto(ra.gPorMetro, 15, 1e-12));
const ma = Dados.metricasParcela([440, 450, 460, 450, 450], 'g', null, 3.6, {}, { ...ra, dose: 300 });
t('alvo por coleta = 15 g/m × 1 m/s × 30 s = 450 g', perto(ma.alvo, 450, 1e-12));
t('desvio da dose = 0%', perto(ma.desvio, 0, 1e-9) && perto(ma.doseAplicada, 300, 1e-9));
t('amplitude ISO = (460 − 440)/450', perto(ma.amplitude, 100 * 20 / 450, 1e-9));
t('vazão = 15 g/s', perto(ma.vazao, 15, 1e-12));

// floresta + SHAP: eficiência (soma dos φ = previsão − base)
const rows = jd; const fat = ['cond', 'ang', 'vel'];
const niv = Object.fromEntries(fat.map((f) => [f, Estat.niveisDe(rows, f)]));
const cod = Floresta.codificar(rows, fat, niv);
const mod = Floresta.treinar(cod.X, rows.map((r) => r.A), { arvores: 40 });
const trat = [...new Map(rows.map((r) => [fat.map((f) => r[f]).join('|'), r])).values()].slice(0, 20);
const sh = Floresta.shap(mod, cod, trat, fat);
t('SHAP: soma dos φ + base = previsão', sh.every((o) => perto(o.phi.reduce((s, v) => s + v, 0) + o.base, o.previsao, 1e-9)));
t('SHAP: linhas da matriz de interações somam φ', sh.every((o) => o.inter.every((lin, i) => perto(lin.reduce((s, v) => s + v, 0), o.phi[i], 1e-9))));

// orquestração com os arquivos de exemplo (se existirem descompactados em tests/tmp)
(async () => {
    const dir = path.join(raiz, 'exemplo');
    if (fs.existsSync(path.join(dir, 'DadosDosadores.zip'))) {
        const JSZip = require(path.join(raiz, 'js/vendor/jszip.min.js'));
        const zip = await JSZip.loadAsync(fs.readFileSync(path.join(dir, 'DadosDosadores.zip')));
        const grupos = {};
        for (const e of Object.values(zip.files)) {
            if (e.dir || !e.name.endsWith('.csv')) continue;
            const [pasta, nome] = e.name.split('/').slice(-2);
            (grupos[pasta] = grupos[pasta] || []).push({ nome, reps: Dados.lerCSV(await e.async('string')).reps });
        }
        const estado = {
            dosadores: Object.entries(grupos).map(([nome, arquivos]) => ({ nome, unidade: 'ms', xref: 0.25, tipo: 'pneumatico', conducao: { c: 'com tubo', s: 'sem tubo' }, arquivos })),
            padrao: { papeis: ['cond', 'long', 'vel'] },
            analise: { resposta: 'A', transformacao: 'nenhuma', alfa: 0.05, arvores: 40, folds: 5, igualarRepeticoes: true, descartarPrimeiro: false, recorte: { long: [-11, 0, 11], vel: [5, 12, 20] } }
        };
        const r = await Analise.executar(estado);
        const b = r.porDosador.find((x) => x.nome === 'JD');
        t('recorte de Andrade reproduz SQ da velocidade (JD ≈ 6371)', perto(b.an.tabela.find((x) => x.nome === 'vel').sq, 6371.13, 0.02));
        t('comparação entre dosadores existe', !!r.conjunto && r.conjunto.fatores[0] === 'dosador');
    }
    console.log(`${ok} de ${ok + falhas} testes passaram`);
    process.exit(falhas ? 1 : 0);
})();
