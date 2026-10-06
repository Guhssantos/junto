// Grava as telas reais do Junto para o vídeo: duas pessoas ("Mãe" e "Gustavo") usando o
// app ao mesmo tempo, cada uma num "celular" isolado. Usa o Chrome instalado no computador.
// Pré-requisitos: Supabase local rodando (npx supabase start) com as contas de teste e
// o build web local em video/app-dist (veja video/README.md).
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const DIST = new URL('./app-dist/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const OUT = new URL('./capturas/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8090;
const MAE = { email: 'ana@junto.test', senha: 'Teste1234' };
const GUS = { email: 'bruno@junto.test', senha: 'Teste1234' };

mkdirSync(OUT, { recursive: true });

// Servidor estático com rota de app de página única (como no Cloudflare).
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.css': 'text/css' };
const server = createServer((req, res) => {
  let file = join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(PORT);
const BASE = `http://localhost:${PORT}`;

// Cada "celular" é um Chrome separado com perfil próprio (sessões independentes).
// Não usa janelas anônimas: algumas políticas corporativas do Chrome as bloqueiam.
const browsers = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function phone({ width = 390, height = 844, scale = 2, mobile = true } = {}) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  browsers.push(b);
  // Neste computador uma extensão corporativa abre/fecha abas logo que o Chrome inicia:
  // espera assentar e tenta de novo se a aba for fechada.
  await sleep(2500);
  for (let tentativa = 1; ; tentativa++) {
    try {
      const page = await b.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: scale, isMobile: mobile, hasTouch: mobile });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
      await page.goto('about:blank');
      return page;
    } catch (e) {
      if (tentativa >= 5) throw e;
      await sleep(1500);
    }
  }
}

// Ações pela interface, como uma pessoa faria
const H = {
  async goto(p, path) {
    await p.goto(BASE + path, { waitUntil: 'networkidle0' });
    await sleep(1200);
  },
  async type(p, selector, text) {
    await p.waitForSelector(selector, { visible: true });
    await p.click(selector, { clickCount: 3 });
    await p.type(selector, text, { delay: 15 });
  },
  async clickText(p, text, { exact = true } = {}) {
    await p.waitForFunction(
      (t, ex) => [...document.querySelectorAll('[role=button],button,[role=tab],[role=radio],a')].some((e) => (ex ? e.textContent.trim() === t : e.textContent.includes(t))),
      { timeout: 15000 }, text, exact,
    );
    await p.evaluate((t, ex) => {
      const el = [...document.querySelectorAll('[role=button],button,[role=tab],[role=radio],a')].find((e) => (ex ? e.textContent.trim() === t : e.textContent.includes(t)));
      el.click();
    }, text, exact);
    await sleep(700);
  },
  async clickLabel(p, label) {
    const sel = `[aria-label="${label}"]`;
    await p.waitForSelector(sel, { visible: true, timeout: 15000 });
    await p.evaluate((s) => document.querySelector(s).click(), sel);
    await sleep(700);
  },
  // Botão de um item específico no modo mercado ("Informar preço" / "Perguntar")
  async clickInCard(p, itemName, buttonText) {
    await p.evaluate((name, btn) => {
      const all = [...document.querySelectorAll('*')];
      let current = null;
      for (const el of all) {
        if (el.childElementCount === 0 && el.textContent.trim() === name) current = name;
        if (current === name && el.matches('[role=button]') && el.textContent.trim() === btn) { el.click(); return; }
      }
      throw new Error(`não achei ${btn} de ${name}`);
    }, itemName, buttonText);
    await sleep(900);
  },
  async login(p, { email, senha }) {
    await H.goto(p, '/sign-in');
    await H.type(p, 'input[type=email]', email);
    await H.type(p, 'input[type=password]', senha);
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => location.pathname === '/home', { timeout: 20000 });
    await sleep(1500);
  },
  async shot(p, name) {
    await p.evaluate(() => document.activeElement?.blur?.());
    await sleep(500);
    await p.screenshot({ path: join(OUT, `${name}.png`) });
    console.log('📸', name);
  },
};

async function addProduct(p, { nome, qtd = 1, unidade, preco }, keepOpen) {
  await H.type(p, 'input[placeholder="Ex.: Leite integral"]', nome);
  for (let i = 1; i < qtd; i++) await H.clickLabel(p, 'Aumentar quantidade');
  if (preco) await H.type(p, 'input[placeholder="R$ 0,00"]', preco);
  if (unidade) {
    await H.clickLabel(p, 'Escolher unidade (opcional)');
    await H.clickLabel(p, unidade);
  }
  return keepOpen ? H.clickText(p, 'Adicionar e continuar') : H.clickText(p, 'Adicionar à lista');
}

try {
  const mae = await phone();
  const gus = await phone();

  // 0) Entrada
  await H.goto(mae, '/sign-in');
  await H.shot(mae, '00-entrar');
  await H.login(mae, MAE);
  await H.login(gus, GUS);
  await H.shot(mae, '01-inicio-vazio');

  // 1) Mãe cria a lista
  await H.clickText(mae, 'Criar lista');
  await H.type(mae, 'input[placeholder="Ex.: Compra do mês"]', 'Compra do mês');
  await H.shot(mae, '02-nova-lista');
  await H.clickText(mae, 'Criar lista');
  await mae.waitForFunction(() => /^\/lists\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 20000 });
  await sleep(1500);
  const listId = mae.url().split('/lists/')[1];
  await H.shot(mae, '03-lista-vazia');

  // 2) Mãe adiciona produtos com preço estimado
  await H.clickLabel(mae, 'Adicionar produto');
  await addProduct(mae, { nome: 'Arroz tipo 1 5 kg', unidade: 'Pacote', preco: '2790' }, true);
  await addProduct(mae, { nome: 'Café torrado 500 g', unidade: 'Pacote', preco: '1890' }, true);
  await addProduct(mae, { nome: 'Leite integral', qtd: 12, unidade: 'Litro', preco: '499' }, true);
  await addProduct(mae, { nome: 'Peito de frango', qtd: 2, unidade: 'Quilograma', preco: '1990' }, true);
  // Formulário preenchido (antes de confirmar) para o vídeo
  await H.type(mae, 'input[placeholder="Ex.: Leite integral"]', 'Banana prata');
  await H.type(mae, 'input[placeholder="R$ 0,00"]', '699');
  await H.clickLabel(mae, 'Escolher unidade (opcional)');
  await H.clickLabel(mae, 'Quilograma');
  await H.shot(mae, '04-adicionar-produto');
  await H.clickText(mae, 'Adicionar à lista');
  await sleep(1500);
  await H.shot(mae, '05-lista-com-precos');

  // 3) Convite: Mãe compartilha, Gustavo pede para entrar, Mãe aprova
  await H.goto(mae, `/lists/${listId}/share`);
  await H.shot(mae, '06-compartilhar');
  const code = await mae.evaluate(() => document.body.innerText.match(/[A-Z]{4}-\d{4}/)[0]);
  await H.goto(gus, `/join/${code}`);
  await gus.waitForFunction(() => document.body.innerText.includes('Pedido enviado'), { timeout: 20000 });
  await H.shot(gus, '07-pedido-enviado');
  await mae.waitForFunction(() => document.body.innerText.includes('deseja participar'), { timeout: 20000 });
  await H.shot(mae, '08-pedido-chegou');
  await H.clickText(mae, 'Aceitar');
  await sleep(1500);

  // 4) Os dois na mesma lista
  await H.goto(mae, `/lists/${listId}`);
  await H.goto(gus, `/lists/${listId}/market`);
  await H.shot(gus, '09-gustavo-modo-mercado');

  // 5) Gustavo no mercado: preço encontrado + carrinho → Mãe vê na hora
  await H.clickInCard(gus, 'Arroz tipo 1 5 kg', 'Informar preço');
  await H.type(gus, 'input[placeholder="0,00"]', '2490');
  await H.shot(gus, '10-gustavo-informa-preco');
  await H.clickText(gus, 'Salvar e marcar como comprado');
  await sleep(2500);
  await H.shot(mae, '11-mae-ve-arroz-comprado');

  await H.clickInCard(gus, 'Café torrado 500 g', 'Informar preço');
  await H.type(gus, 'input[placeholder="0,00"]', '2250');
  await H.clickText(gus, 'Salvar preço');
  await sleep(2500);
  await H.shot(gus, '12-gustavo-mercado-atualizado');
  await H.shot(mae, '13-mae-ve-cafe-mais-caro');

  // 6) Conversa: comparando com outro mercado
  await H.goto(gus, `/lists/${listId}?tab=chat`);
  await H.goto(mae, `/lists/${listId}?tab=chat`);
  const send = async (p, text) => {
    await H.type(p, 'textarea[aria-label="Mensagem"]', text);
    await p.keyboard.press('Enter');
    await sleep(1800);
  };
  await send(gus, 'Mãe, o arroz aqui tá R$ 24,90, mais barato que no outro mercado. Já peguei!');
  await send(gus, 'Mas o café tá R$ 22,50 😬 lá no atacado tava R$ 18,90.');
  await send(mae, 'Então deixa o café, amanhã eu passo no atacado e compro lá.');
  await send(gus, 'Combinado! 👍');
  await sleep(1200);
  await H.shot(mae, '14-conversa-mae');
  await H.shot(gus, '15-conversa-gustavo');

  // 7) Achou promoção fora da lista → pergunta → Mãe decide
  await H.goto(gus, `/lists/${listId}/market`);
  await H.clickText(gus, 'Achei algo fora da lista — perguntar');
  await H.type(gus, 'input[placeholder="Ex.: Chocolate 70%"]', 'Azeite extra virgem 500 ml');
  await H.type(gus, 'input[placeholder="0,00"]', '3290');
  await H.type(gus, 'input[placeholder="Ex.: Está na promoção!"]', 'Tá em promoção, levo um?');
  await H.shot(gus, '16-gustavo-pergunta');
  await H.clickText(gus, 'Enviar pergunta');
  await sleep(2000);
  await H.goto(mae, `/lists/${listId}`);
  await mae.waitForFunction(() => document.body.innerText.includes('Azeite extra virgem'), { timeout: 20000 });
  await H.shot(mae, '17-mae-decide');
  await H.clickText(mae, 'Adicionar', { exact: true });
  await sleep(2500);
  await H.shot(gus, '18-gustavo-aprovado');
  await H.shot(mae, '19-mae-depois');

  // 8) Visão geral em telas maiores (computador)
  const pc = await phone({ width: 1440, height: 900, scale: 1.5, mobile: false });
  await H.login(pc, MAE);
  await H.goto(pc, `/lists/${listId}`);
  await H.shot(pc, '20-computador');

  console.log('✓ capturas em', OUT, '| lista', listId);
} catch (e) {
  console.error('✗', e.stack);
  process.exitCode = 1;
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  server.close();
}
