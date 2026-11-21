/**
 * © 2026 Comparador de Dosadores — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
 *
 * Leitura dos dados brutos, interpretação do nome dos arquivos e cálculo das respostas por parcela
 * (espaçamentos aceitáveis, falhos e múltiplos segundo Coelho, 1996; CV; ou, para adubo em massa por intervalo de coleta, vazão, CV e desvio da dose pela ISO 5690-2).
 */
'use strict';

const Dados = (() => {
    const PAPEIS = {
        cond: 'Condução (tubo)',
        long: 'Inclinação longitudinal (°)',
        lat: 'Inclinação lateral (°)',
        vel: 'Velocidade simulada (km/h)',
        outro: 'Outro fator',
        ignorar: 'Ignorar'
    };
    const UNIDADES = {
        ms: { rotulo: 'Tempo entre sementes (ms)', tipo: 'tempo', fator: 1 },
        s: { rotulo: 'Tempo entre sementes (s)', tipo: 'tempo', fator: 1000 },
        mm: { rotulo: 'Distância entre sementes (mm)', tipo: 'dist', fator: 0.001 },
        cm: { rotulo: 'Distância entre sementes (cm)', tipo: 'dist', fator: 0.01 },
        m: { rotulo: 'Distância entre sementes (m)', tipo: 'dist', fator: 1 },
        g: { rotulo: 'Massa por intervalo de coleta (g) — adubo, ISO 5690-2', tipo: 'massa', fator: 1 }
    };
    /** Critérios de Coelho (1996) por tipo de dosador. */
    const TIPOS_DOSADOR = {
        pneumatico: { rotulo: 'Disco vertical pneumático', minAceitaveis: 90, maxCV: 30 },
        perfurado: { rotulo: 'Disco perfurado horizontal', minAceitaveis: 60, maxCV: 50 },
        outro: { rotulo: 'Outro (definir limites)', minAceitaveis: 90, maxCV: 30 }
    };

    /** Lê um CSV de intervalos: primeira coluna "n" (índice) opcional; as demais são as repetições. */
    function lerCSV(texto) {
        const linhas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
        if (!linhas.length) return { reps: [], cab: [] };
        const sep = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ';' : (linhas[0].includes('\t') ? '\t' : ',');
        const cab = linhas[0].split(sep).map((s) => s.trim());
        const temCab = cab.some((c) => Number.isNaN(Number(c.replace(',', '.'))));
        const corpo = temCab ? linhas.slice(1) : linhas;
        const nomes = temCab ? cab : cab.map((_, i) => `col${i + 1}`);
        let cols = nomes.map((_, i) => i);
        const ehIndice = (nm) => /^(n|nº|no|idx|index|indice|índice|amostra)$/i.test(nm);
        if (temCab && ehIndice(nomes[0])) cols = cols.slice(1);
        else if (!temCab) {
            // sem cabeçalho: se a 1ª coluna for 1, 2, 3... trata como índice
            const prim = corpo.slice(0, 5).map((l) => Number(l.split(sep)[0]));
            if (prim.every((v, i) => v === i + 1)) cols = cols.slice(1);
        }
        const reps = cols.map(() => []);
        for (const l of corpo) {
            const v = l.split(sep);
            cols.forEach((c, k) => {
                const s = (v[c] || '').trim().replace(',', '.');
                if (s !== '' && Number.isFinite(Number(s))) reps[k].push(Number(s));
            });
        }
        return { reps: reps.filter((r) => r.length), cab: cols.map((c) => nomes[c]) };
    }

    const baseNome = (nome) => nome.split('/').pop().replace(/\.[^.]+$/, '');
    const tokens = (nome) => baseNome(nome).split('_').filter((t) => t !== '');
    const numero = (t) => { const v = Number(String(t).replace(',', '.')); return Number.isFinite(v) ? v : null; };

    /** Sugestão de papéis: 3 partes → condução, longitudinal, velocidade; 4 partes → os dois ângulos ficam em aberto. */
    function sugerirPapeis(nTokens, exemplos) {
        const papeis = new Array(nTokens).fill('');
        const naoNum = [...Array(nTokens).keys()].filter((i) => exemplos.some((t) => numero(t[i]) === null));
        if (naoNum.length) papeis[naoNum[0]] = 'cond';
        const num = [...Array(nTokens).keys()].filter((i) => !naoNum.includes(i));
        // velocidade: último numérico sem sinal negativo
        const vel = [...num].reverse().find((i) => exemplos.every((t) => numero(t[i]) >= 0));
        if (vel !== undefined) papeis[vel] = 'vel';
        const angs = num.filter((i) => i !== vel);
        if (angs.length === 1) papeis[angs[0]] = 'long';
        // com dois ângulos, quem decide é o usuário (lateral ou longitudinal)
        return papeis;
    }

    /** Interpreta os fatores de um arquivo a partir dos papéis definidos. */
    function fatoresDoArquivo(nome, papeis, nomesOutros) {
        const t = tokens(nome);
        const f = {};
        papeis.forEach((p, i) => {
            if (!p || p === 'ignorar') return;
            const v = t[i];
            if (p === 'cond') f.cond = v;
            else if (p === 'outro') f[nomesOutros?.[i] || `fator${i + 1}`] = numero(v) ?? v;
            else f[p] = numero(v) ?? v;
        });
        return f;
    }

    /**
     * Referência agronômica.
     * Sementes: Xref (m) direto, sementes por metro, ou população (sementes/ha) com espaçamento entre linhas (m).
     * Adubo: dose (kg/ha) com espaçamento entre linhas (m) → taxa por metro de linha (g/m) = dose·e/10.
     */
    function referenciaAgronomica(d) {
        if (UNIDADES[d.unidade]?.tipo === 'massa') {
            const ok = d.dose > 0 && d.espacamento > 0 && d.intervalo > 0;
            return { ok, gPorMetro: ok ? d.dose * d.espacamento / 10 : NaN, intervalo: d.intervalo };
        }
        let xref = NaN;
        if (d.xrefModo === 'densidade') xref = d.densidade > 0 ? 1 / d.densidade : NaN;
        else if (d.xrefModo === 'populacao') xref = d.populacao > 0 && d.espacamento > 0 ? 10000 / (d.populacao * d.espacamento) : NaN;
        else xref = d.xref > 0 ? d.xref : NaN;
        return { ok: Number.isFinite(xref), xref };
    }

    /** Referência de intervalo: Tref (ms) = 3,6·Xref(mm)/V ou Xref em metros para distância. */
    function referencia(unidade, xrefM, vel) {
        const u = UNIDADES[unidade];
        if (u.tipo === 'tempo') return (3.6 * xrefM / vel) * 1000; // ms
        if (u.tipo === 'dist') return xrefM;
        return null;
    }

    /** Respostas de uma parcela (uma repetição de um tratamento). */
    function metricasParcela(vals0, unidade, xrefM, vel, opc = {}, adubo = null) {
        const u = UNIDADES[unidade];
        const vals = opc.descartarPrimeiro ? vals0.slice(1) : vals0;
        if (u.tipo === 'massa') {
            // ISO 5690-2: vazão = massa por unidade de tempo; uniformidade pelo CV; exatidão pelo desvio em relação à dose regulada
            const n = vals.length;
            const m = vals.reduce((s, v) => s + v, 0) / n;
            const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(n - 1, 1));
            const out = { n, media: m, CV: 100 * sd / m, amplitude: 100 * (Math.max(...vals) - Math.min(...vals)) / m };
            if (adubo && adubo.intervalo > 0) {
                out.vazao = m / adubo.intervalo; // g/s
                if (vel > 0 && adubo.gPorMetro > 0) {
                    const alvo = adubo.gPorMetro * (vel / 3.6) * adubo.intervalo; // g por coleta
                    out.alvo = alvo;
                    out.desvio = 100 * (m - alvo) / alvo;
                    out.erroAbs = Math.abs(out.desvio);
                    out.doseAplicada = adubo.dose ? adubo.dose * m / alvo : NaN; // kg/ha
                }
            }
            return out;
        }
        const ref = referencia(unidade, xrefM, vel);
        const r = vals.map((v) => (v * u.fator) / ref); // razão Xi/Xref (ou Ti/Tref)
        let a = 0, f = 0, mu = 0;
        const ac = [];
        for (const x of r) {
            if (x < 0.5) mu++;
            else if (x > 1.5) f++;
            else { a++; ac.push(x); }
        }
        const n = r.length;
        const mA = ac.reduce((s, v) => s + v, 0) / ac.length;
        const sdA = Math.sqrt(ac.reduce((s, v) => s + (v - mA) ** 2, 0) / Math.max(ac.length - 1, 1));
        const mT = r.reduce((s, v) => s + v, 0) / n;
        const sdT = Math.sqrt(r.reduce((s, v) => s + (v - mT) ** 2, 0) / Math.max(n - 1, 1));
        return { n, A: 100 * a / n, F: 100 * f / n, M: 100 * mu / n, CVA: 100 * sdA / mA, CV: 100 * sdT / mT, razaoMedia: mT };
    }

    /**
     * Gera a tabela de parcelas de todos os dosadores.
     * opc.repeticoes: número de repetições usadas por arquivo (as primeiras), para manter o delineamento balanceado.
     */
    function parcelas(dosadores, papeis, nomesOutros, opc = {}) {
        const out = [];
        for (const d of dosadores) {
            for (const arq of d.arquivos) {
                const f = fatoresDoArquivo(arq.nome, papeis, nomesOutros);
                if (f.cond !== undefined) f.cond = d.conducao?.[f.cond] || f.cond;
                const vel = f.vel;
                const nRep = opc.repeticoes ? Math.min(opc.repeticoes, arq.reps.length) : arq.reps.length;
                for (let k = 0; k < nRep; k++) {
                    const m = metricasParcela(arq.reps[k], d.unidade, d.xref, vel, opc, d.adubo);
                    out.push({ dosador: d.nome, ...f, rep: k + 1, arquivo: arq.nome, ...m });
                }
            }
        }
        return out;
    }

    /** Respostas disponíveis conforme o tipo de dado. */
    function respostas(unidade) {
        if (UNIDADES[unidade]?.tipo === 'massa') return { CV: 'CV da vazão entre coletas (%) — uniformidade, ISO 5690-2', desvio: 'Desvio em relação à dose regulada (%) — exatidão', erroAbs: 'Erro absoluto em relação à dose (%)', amplitude: 'Amplitude relativa (Dmáx − Dmín)/D (%) — ISO 5690-2', doseAplicada: 'Dose aplicada (kg/ha)', vazao: 'Vazão (g/s)' };
        return { A: 'Espaçamentos aceitáveis (%)', F: 'Espaçamentos falhos (%)', M: 'Espaçamentos múltiplos (%)', CVA: 'CV dos espaçamentos aceitáveis (%)', CV: 'CV de todos os espaçamentos (%)' };
    }

    return { PAPEIS, UNIDADES, TIPOS_DOSADOR, lerCSV, tokens, baseNome, numero, sugerirPapeis, fatoresDoArquivo, metricasParcela, parcelas, respostas, referencia, referenciaAgronomica };
})();

if (typeof module !== 'undefined') module.exports = Dados;
