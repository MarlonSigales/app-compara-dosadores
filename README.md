# Comparador de Dosadores

App web (roda só no navegador, sem servidor e sem CDN) para comparar dosadores de sementes ou adubo a partir dos dados brutos de bancada.

**Entrada:** um CSV por tratamento (primeira coluna `n`, uma coluna por repetição) com o intervalo entre sementes em tempo (ms ou s) ou distância (mm, cm ou m), ou a massa por amostra (g). Os fatores vêm do nome do arquivo, separados por `_`, por exemplo `c_-5_08.csv` (tubo, ângulo, velocidade) ou `c_-5_0_08.csv` (tubo, ângulo, ângulo, velocidade). Quando há dois ângulos, o app pergunta qual é o lateral e qual é o longitudinal.

**Cadastro de cada dosador:** marca, modelo, sementes ou adubo, semente/adubo usado, tipo de dosador (limites de Coelho, 1996), tubo condutor usado e a referência agronômica, obrigatória: para sementes, população (sementes/ha) e espaçamento entre linhas, sementes por metro ou X<sub>ref</sub>; para adubo, dose (kg/ha), espaçamento entre linhas e intervalo de coleta.

**Adubo (massa por intervalo de coleta):** segue a ISO 5690-2 — vazão, CV entre coletas (uniformidade), amplitude relativa (D<sub>máx</sub> − D<sub>mín</sub>)/D e desvio em relação à dose regulada (exatidão).

**Análises:**
- espaçamentos múltiplos, aceitáveis e falhos (Coelho, 1996), CV dos aceitáveis e de todos os espaçamentos, por parcela;
- ANOVA fatorial com todas as interações (SQ pelas médias marginais no caso balanceado e tipo II por mínimos quadrados no desbalanceado), pressupostos (Shapiro-Wilk e Levene/Brown-Forsythe), opção arcsen√p, Tukey dos efeitos principais e desdobramento das interações significativas com o QM do erro do modelo completo, intervalo de confiança de cada tratamento e ajuste sigmoidal, como no trabalho de Henrique Gonçalves Andrade;
- Random Forest + SHAP na forma proposta: mesma resposta da ANOVA, cada fator como um jogador, validação agrupada por tratamento, importância por permutação e SHAP exato com interações;
- curva do processo de cada dosador: superfície contínua por processo gaussiano (resposta, faixa de 95% e sensibilidade em qualquer ponto ensaiado) e double/debiased machine learning (efeito de cada fator e curva dose-resposta AIPW);
- comparação entre dosadores (dosador como fator), só com os tratamentos comuns a todos.

**Saídas:** abas de ANOVA, RF + SHAP e gráficos (mapas de calor com escala de cor editável: vermelho–amarelo–verde, plasma, viridis ou personalizada), e relatório completo (dados, metodologia passo a passo e resultados) para imprimir/salvar em PDF ou baixar em HTML. O projeto inteiro (com os dados brutos) é exportado e importado em JSON.

O botão **Exemplo** carrega os ensaios de Andrade (John Deere MaxEmerge 5, Precision Planting vSet e Matermacc) de `exemplo/DadosDosadores.zip`.

## Estrutura
- `index.html`, `css/estilo.css`
- `js/estatistica.js` — ANOVA, Tukey, desdobramentos, pressupostos, sigmoide
- `js/superficie.js` — processo gaussiano e DML (curva do processo)
- `js/floresta.js` — Random Forest de regressão, validação agrupada, permutação, SHAP
- `js/dados.js` — leitura dos CSV, nome dos arquivos, respostas por parcela
- `js/analise.js` — orquestra as análises
- `js/graficos.js` — gráficos em SVG e escalas de cor
- `js/relatorio.js` — tabelas, mapas e relatório
- `js/app.js` — interface
- `js/vendor/` — jStat e JSZip (cópias locais)
- `css/style.css` — identidade visual compartilhada (Gestão de Projetos, QFD, Apoio à Escrita de Patentes)
- `img/` — logos Inova Agro/EMBRAPII, NIMEq e InstAgri e ícone do app
- `tests/` — `testes.js` (núcleo, conferido com statsmodels/scipy) e `testes_ui.py` (Playwright)

## Testes
```
node tests/testes.js
python3 -m http.server 8765 &   # na pasta do app
python3 tests/testes_ui.py tests/exemplo_quatro_partes.zip tests/exemplo_adubo.zip
```

## Autoria e citação
Desenvolvedor: Marlon Soares Sigales. Coautores do projeto: Roger Toscan Spagnolo, Eduardo Walker, Fabrício Ardais Medeiros. Coautores na geração dos dados: Marlon Soares Sigales, Ângelo Vieira dos Reis, Rafael dos Santos Esteche, Jean Carlos Scheunemann, Henrique Gonçalves Andrade.

Como citar: SIGALES, Marlon Soares; SPAGNOLO, Roger Toscan; WALKER, Eduardo; MEDEIROS, Fabrício Ardais; REIS, Ângelo Vieira dos; ESTECHE, Rafael dos Santos; SCHEUNEMANN, Jean Carlos; ANDRADE, Henrique Gonçalves. *Comparador de Dosadores*: análise de ensaios de dosadores de sementes e adubo por ANOVA e Random Forest + SHAP. Pelotas: Laboratório de Instrumentação Agrícola, Universidade Federal de Pelotas, 2026. Aplicativo web. Disponível em: https://marlonsigales.github.io/app-compara-dosadores/index.html.

Inclua o relatório completo gerado pelo app como anexo dos trabalhos que usarem seus resultados.

© 2026 Marlon Sigales. Todos os direitos reservados (ver LICENSE).
