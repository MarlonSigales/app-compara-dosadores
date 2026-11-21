"""
© 2026 Comparador de Dosadores — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
Testes de interface (Playwright). Rode um servidor na pasta do app (python3 -m http.server 8765) e depois:
    python3 tests/testes_ui.py tests/exemplo_quatro_partes.zip tests/exemplo_adubo.zip
"""
import asyncio, sys, time
from playwright.async_api import async_playwright

URL = 'http://localhost:8765/index.html'
ok = falhas = 0
def t(nome, cond):
    global ok, falhas
    if cond: ok += 1
    else: falhas += 1; print('FALHOU:', nome)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
        erros = []
        pg.on('pageerror', lambda e: erros.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL)
        # exemplo completo
        await pg.click('.sidebar-arquivo-mais summary'); await pg.click('[data-acao=exemplo]'); await pg.wait_for_function("document.querySelectorAll('#lista-dosadores .cartao').length===3", timeout=30000)
        t('exemplo cria 3 dosadores', True)
        await pg.goto(URL + '#fatores'); await pg.wait_for_timeout(300)
        t('padrão do nome definido no exemplo', await pg.locator('text=Padrão do nome definido').count() == 1)
        await pg.goto(URL + '#analise'); await pg.wait_for_timeout(300)
        await pg.fill('[data-an=arvores]', '60'); await pg.dispatch_event('[data-an=arvores]', 'change')
        await pg.click('[data-acao=recorte-andrade]')
        t0 = time.time(); await pg.click('[data-acao=rodar]')
        await pg.wait_for_function("location.hash==='#anova'", timeout=300000)
        print('análise do exemplo (recorte):', round(time.time() - t0, 1), 's')
        txt = await pg.inner_text('#anova-corpo')
        t('quadro da ANOVA aparece', 'Quadro da ANOVA' in txt and 'Erro' in txt)
        t('Tukey aparece', 'Tukey' in txt)
        for aba in ['rf', 'curva', 'graficos', 'relatorio']:
            await pg.goto(URL + '#' + aba); await pg.wait_for_timeout(400)
        t('relatório tem referências', await pg.locator('#relatorio-corpo >> text=Referências').count() >= 1)
        rel = await pg.inner_text('#relatorio-corpo')
        t('relatório traz o link do app', 'marlonsigales.github.io/app-compara-dosadores' in rel)
        t('relatório traz os coautores', all(n in rel for n in ['Marlon Soares Sigales', 'Ângelo Vieira dos Reis', 'Rafael dos Santos Esteche', 'Jean Carlos Scheunemann', 'Henrique Gonçalves Andrade', 'Matheus Albarracin Caselatto']))
        t('relatório pede citação', 'Como citar' in rel)
        t('citação inclui Caselatto e Stefanello', 'CASELATTO, Matheus Albarracin; STEFANELLO, Giusepe' in rel)
        t('relatório traz coautores do projeto', all(n in rel.split('Coautores do projeto:')[1].split('\n')[0] for n in ['Ângelo Vieira dos Reis', 'Rafael dos Santos Esteche', 'Jean Carlos Scheunemann', 'Henrique Gonçalves Andrade', 'Matheus Albarracin Caselatto', 'Roger Toscan Spagnolo', 'Eduardo Walker', 'Fabrício Ardais Medeiros', 'Giusepe Stefanello']))
        t('relatório pede anexo', 'anexo' in rel)
        t('relatório traz curva do processo e DML', 'Curva do processo' in rel and 'Double/debiased' in rel)
        t('relatório traz todas as parcelas', 'Todas as parcelas' in rel)
        t('relatório tem mapas SVG', await pg.locator('#relatorio-corpo svg').count() > 10)
        t('relatório mostra os erros do RF + SHAP em cores', await pg.locator('#relatorio-corpo >> text=Erro do modelo completo que os valores SHAP explicam').count() >= 1)
        await pg.goto(URL + '#rf'); await pg.wait_for_timeout(400)
        t('aba RF + SHAP mostra 3 mapas de erro', await pg.locator('#rf-corpo figure svg').count() >= 4)
        await pg.screenshot(path='/tmp/ui_rf.png', full_page=True)
        await pg.goto(URL + '#relatorio'); await pg.wait_for_timeout(400)
        async with pg.expect_download() as d:
            await pg.click('[data-acao=baixar-html]')
        t('baixa HTML', (await d.value).suggested_filename.endswith('.html'))
        # troca de escala de cor muda os mapas
        await pg.goto(URL + '#graficos'); await pg.wait_for_timeout(300)
        antes = await pg.inner_html('#graficos-corpo')
        await pg.select_option('[data-preset=esc]', 'plasma'); await pg.wait_for_timeout(300)
        depois = await pg.inner_html('#graficos-corpo')
        t('escala plasma redesenha os mapas', antes != depois and '#0d0887' in depois.lower() or '#4b03a1' in depois.lower())
        # telas estreitas: sem rolagem horizontal da página
        for w in [360, 768, 1920]:
            await pg.set_viewport_size({'width': w, 'height': 800})
            for aba in ['inicio', 'dosadores', 'fatores', 'analise', 'anova', 'relatorio']:
                await pg.goto(URL + '#' + aba); await pg.wait_for_timeout(150)
                larg = await pg.evaluate('document.documentElement.scrollWidth')
                t(f'sem estouro horizontal {w}px #{aba}', larg <= w + 1)
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        # nome com 4 partes: pergunta lateral × longitudinal
        if len(sys.argv) > 1:
            await pg.evaluate("document.querySelector('.sidebar-arquivo-mais').open=true"); await pg.click('[data-acao=novo]'); await pg.wait_for_timeout(300)
            await pg.goto(URL + '#dosadores')
            await pg.set_input_files('#zip-geral', sys.argv[1]); await pg.wait_for_timeout(1500)
            for campo, val in [('populacao', '80000'), ('espacamento', '0.5')]:
                await pg.fill(f'[data-campo={campo}]', val); await pg.dispatch_event(f'[data-campo={campo}]', 'change'); await pg.wait_for_timeout(200)
            t('população e espaçamento dão Xref 0,25 m', await pg.locator('text=0,250 m').count() >= 1)
            await pg.goto(URL + '#fatores'); await pg.wait_for_timeout(300)
            t('pergunta dos dois ângulos aparece', await pg.locator('#pergunta-angulos').count() == 1)
            await pg.goto(URL + '#analise'); await pg.wait_for_timeout(300)
            t('análise bloqueada sem a resposta', await pg.locator('[data-acao=rodar]').is_disabled())
            await pg.goto(URL + '#fatores'); await pg.wait_for_timeout(300)
            await pg.select_option('[data-papel="1"]', 'long'); await pg.wait_for_timeout(200)
            await pg.select_option('[data-papel="2"]', 'lat'); await pg.wait_for_timeout(200)
            t('padrão definido após a resposta', await pg.locator('text=Padrão do nome definido').count() == 1)
            await pg.goto(URL + '#analise'); await pg.wait_for_timeout(300)
            await pg.fill('[data-an=arvores]', '50'); await pg.dispatch_event('[data-an=arvores]', 'change')
            await pg.click('[data-acao=rodar]')
            await pg.wait_for_function("location.hash==='#anova'", timeout=300000)
            txt = await pg.inner_text('#anova-corpo')
            t('ANOVA com inclinação lateral', 'Lat' in txt)
            await pg.goto(URL + '#relatorio'); await pg.wait_for_timeout(500)
            await pg.screenshot(path='/tmp/ui_quatro.png', full_page=True)
        # adubo em massa por intervalo de coleta (ISO 5690-2)
        if len(sys.argv) > 2:
            await pg.evaluate("document.querySelector('.sidebar-arquivo-mais').open=true"); await pg.click('[data-acao=novo]'); await pg.wait_for_timeout(300)
            await pg.goto(URL + '#dosadores')
            await pg.set_input_files('#zip-geral', sys.argv[2]); await pg.wait_for_timeout(1500)
            await pg.select_option('[data-campo=unidade]', 'g'); await pg.wait_for_timeout(300)
            await pg.goto(URL + '#analise'); await pg.wait_for_timeout(300)
            t('adubo sem referência bloqueia a análise', await pg.locator('[data-acao=rodar]').is_disabled()); print('ERROS:', await pg.inner_text('#analise-corpo .alerta') if await pg.locator('#analise-corpo .alerta').count() else '-')
            await pg.goto(URL + '#dosadores'); await pg.wait_for_timeout(300)
            for campo, val in [('dose', '300'), ('espacamento', '0.5')]:
                await pg.fill(f'[data-campo={campo}]', val); await pg.dispatch_event(f'[data-campo={campo}]', 'change'); await pg.wait_for_timeout(200)
            t('mostra a taxa por metro', await pg.locator('text=15,00 g/m').count() == 1)
            await pg.goto(URL + '#analise'); await pg.wait_for_timeout(300)
            await pg.select_option('[data-an=resposta]', 'desvio'); await pg.wait_for_timeout(200)
            if await pg.locator('#analise-corpo .alerta').count(): print('ERROS2:', await pg.inner_text('#analise-corpo .alerta'))
            await pg.fill('[data-an=arvores]', '50'); await pg.dispatch_event('[data-an=arvores]', 'change')
            await pg.click('[data-acao=rodar]')
            await pg.wait_for_function("location.hash==='#anova'", timeout=300000)
            txt = await pg.inner_text('#anova-corpo')
            t('ANOVA do desvio da dose', 'Desvio em relação à dose' in txt)
            await pg.goto(URL + '#relatorio'); await pg.wait_for_timeout(500)
            t('relatório cita a ISO 5690-2', await pg.locator('#relatorio-corpo >> text=ISO 5690-2').count() >= 1)
            await pg.screenshot(path='/tmp/ui_adubo.png', full_page=True)
        # menu lateral no celular
        await pg.set_viewport_size({'width': 390, 'height': 800}); await pg.goto(URL + '#inicio'); await pg.wait_for_timeout(200)
        await pg.click('.sidebar-toggle'); await pg.wait_for_timeout(300)
        t('menu abre no celular', await pg.evaluate("document.body.classList.contains('sidebar-aberta')"))
        await pg.click('#etapas a[data-pag=dosadores]'); await pg.wait_for_timeout(300)
        t('menu fecha ao navegar', not await pg.evaluate("document.body.classList.contains('sidebar-aberta')"))
        await pg.set_viewport_size({'width': 1366, 'height': 900})
        t('sem erros de JavaScript', not erros)
        if erros: print('JSERR', erros)
        await b.close()
    print(f'{ok} de {ok + falhas} testes passaram')
    sys.exit(1 if falhas else 0)

asyncio.run(main())
