import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _electron as electron, expect } from '@playwright/test';
import path from 'node:path';
import { mkdir, access, unlink, readFile } from 'node:fs/promises';

test('DXF local: abrir, capas, zoom, PNG y archivo inválido', { timeout: 90000 }, async () => {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, MX_CAD_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.locator('#open-empty').waitFor();
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/inicio-mx-cad.png' });
    assert.equal(await page.locator('#fit').isDisabled(), true);
    await page.locator('#file-input').setInputFiles('public/ejemplo.dxf');
    await page.locator('#empty').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#filename').textContent(), 'ejemplo.dxf');
    assert.ok(Number(await page.locator('#layer-count').textContent()) >= 4);
    assert.equal(await page.locator('#prop-format').textContent(), 'DXF');
    assert.equal(await page.locator('#stat-files').textContent(), '1');
    assert.equal(await page.locator('#stat-entities').textContent(), '46');
    console.log('DXF y capas cargados');
    const layer = page.getByRole('checkbox', { name: 'Mostrar capa MUROS', exact: true });
    await layer.uncheck(); assert.equal(await layer.isChecked(), false); await layer.check();
    const before = await page.locator('#coordinates').textContent(); await page.locator('#plus').click();
    assert.notEqual(await page.locator('#coordinates').textContent(), before);
    await page.locator('#search').fill('MUROS'); assert.equal(await page.locator('.layer').count(), 1);
    await page.locator('#search').fill('');
    await page.locator('.general summary').click(); await page.locator('#background-light').click();
    assert.equal(await page.locator('.shell').evaluate(n => n.classList.contains('light-view')), true);
    await page.locator('.general summary').click(); await page.locator('#background-dark').click();
    await page.locator('#panel-toggle').click(); assert.equal(await page.locator('.sidebar').isVisible(), false);
    await page.locator('#panel-toggle').click(); assert.equal(await page.locator('.sidebar').isVisible(), true);
    await page.locator('#fit').click();
    console.log('Capas y zoom verificados');
    await mkdir('test-results', { recursive: true });
    await unlink('test-results/ejemplo.png').catch(error => { if (error.code !== 'ENOENT') throw error; });
    await app.evaluate(({ session }, savePath) => {
      session.defaultSession.on('will-download', (_event, item) => item.setSavePath(savePath));
    }, path.resolve('test-results/ejemplo.png'));
    await page.locator('#export').click();
    await expect.poll(async () => { try { await access('test-results/ejemplo.png'); return true; } catch { return false; } }).toBe(true);
    const png = await readFile('test-results/ejemplo.png');
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    console.log('PNG exportado');
    await page.screenshot({ path: 'test-results/visor.png' });
    await page.locator('#file-input').setInputFiles({ name: 'vacio.dxf', mimeType: 'application/octet-stream', buffer: Buffer.alloc(0) });
    assert.match(await page.locator('#notice').textContent(), /vacío/);
    await page.locator('#file-input').setInputFiles({ name: 'invalido.dwg', mimeType: 'application/octet-stream', buffer: Buffer.from('NOT A DWG') });
    await page.locator('#busy').waitFor({ state: 'hidden' });
    assert.match(await page.locator('#notice').textContent(), /No se pudo leer/);
    const dwgFixture = process.env.MX_CAD_DWG_FIXTURE;
    if (dwgFixture) {
      await access(dwgFixture);
      await page.locator('#file-input').setInputFiles(dwgFixture);
      await page.locator('#busy').waitFor({ state: 'hidden', timeout: 120000 });
      assert.equal(await page.locator('#filename').textContent(), path.basename(dwgFixture));
      assert.match(await page.locator('#filemeta').textContent(), /DWG/);
      assert.match(await page.locator('#status').textContent(), /entidades/);
      await page.screenshot({ path: 'test-results/dwg.png' });
    }
    assert.deepEqual(errors, []);
    await page.locator('#clear').click();
    assert.equal(await page.locator('#stat-files').textContent(), '0');
    assert.equal(await page.locator('#prop-format').textContent(), '—');
    assert.equal(await page.locator('#empty').isVisible(), true);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({path:'test-results/mx-cad-movil.png'});
  } finally { await app.close(); }
});
