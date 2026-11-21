"""
© 2026 Comparador de Dosadores — Marlon Sigales. Todos os direitos reservados; copiar, reproduzir ou alterar exige autorização do autor (ver LICENSE).
Testes de interface (Playwright). Rode um servidor na pasta do app (python3 -m http.server 8765) e depois:
    python3 tests/testes_ui.py [zip_com_4_partes_no_nome]
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
        await pg.click('[data-acao=exemplo]'); await pg.wait_for_function("document.querySelectorAll('#lista-dosadores .cartao').length===3", timeout=30000)
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
        for aba in ['rf', 'graficos', 'relatorio']:
            await pg.goto(URL + '#' + aba); await pg.wait_for_timeout(400)
        t('relatório tem referências', await pg.locator('#relatorio-corpo >> text=Referências').count() >= 1)
        t('relatório tem mapas SVG', await pg.locator('#relatorio-corpo svg').count() > 10)
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
            await pg.click('[data-acao=novo]'); await pg.wait_for_timeout(300)
            await pg.goto(URL + '#dosadores')
            await pg.set_input_files('#zip-geral', sys.argv[1]); await pg.wait_for_timeout(1500)
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
        t('sem erros de JavaScript', not erros)
        if erros: print(erros)
        await b.close()
    print(f'{ok} de {ok + falhas} testes passaram')
    sys.exit(1 if falhas else 0)

asyncio.run(main())
