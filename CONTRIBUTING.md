# Como contribuir com o Junto

Obrigado pelo interesse! Toda ajuda é bem-vinda: relatar um problema, sugerir uma ideia, melhorar um texto ou enviar código.

## Formas de ajudar

- **Encontrou um problema?** [Abra uma issue de bug](https://github.com/Guhssantos/junto/issues/new?template=bug.yml) com os passos para reproduzir.
- **Tem uma ideia?** [Sugira uma funcionalidade](https://github.com/Guhssantos/junto/issues/new?template=ideia.yml).
- **Quer programar?** Procure issues marcadas como `good first issue` ou `help wanted`, comente que vai pegar e siga os passos abaixo.
- **Falha de segurança?** Não abra issue pública — veja [SECURITY.md](SECURITY.md).

## Rodando o projeto na sua máquina

Requisitos: **Node.js 20+**, **Git** e **Docker** (para o banco local).

```bash
git clone https://github.com/<seu-usuario>/junto.git   # depois de fazer o fork
cd junto
npm install
npx supabase start          # sobe o banco local (Postgres, Auth, Realtime, Storage) e aplica as migrações
npm run setup               # cria o .env: use a API URL e a anon/publishable key que o comando acima mostrou
npm run web                 # abre em http://localhost:8081
```

- No celular (mesmo Wi-Fi): `npx expo start --web --host lan` e abra `http://IP-DO-COMPUTADOR:8081`.
- E-mails do ambiente local (ex.: recuperação de senha) aparecem em <http://localhost:54324>.
- Detalhes e solução de problemas: [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md).

## Antes de abrir o pull request

```bash
npm run test:all    # tipos + lint + testes do app + testes do banco (o banco roda embutido, sem Docker)
```

O CI do GitHub roda as mesmas verificações e o build web em todo pull request.

## Fluxo

1. Faça um **fork** e crie um ramo a partir de `main`: `git checkout -b corrige-total-da-lista`.
2. Faça commits pequenos, com mensagens claras (em português).
3. Mudou o banco? Crie uma **nova** migração (`npx supabase migration new nome`) — nunca edite migrações já publicadas — e um teste em `supabase/tests/`. Depois rode `npm run sql:completo`.
4. Mudou algo visível? Coloque prints (celular e computador) no pull request.
5. Abra o pull request preenchendo o modelo.

## Regras do projeto (aprendidas na prática)

- **Textos em português** (interface, mensagens de erro e comentários).
- **Regras de negócio e permissões ficam no banco** (funções RPC + RLS), não só na tela. Tabela nova = RLS ligada.
- **Web e celular**: o app roda nos dois. Evite APIs que só existem com HTTPS sem alternativa (use `uuid()` de `src/lib/uuid.ts`, nunca `crypto.randomUUID` direto).
- Diálogos com `showDialog` (`src/lib/dialog.ts`), não `Alert.alert` (não funciona no navegador).
- **Não coloque um botão dentro de outro** (`Pressable` dentro de `Pressable`): vira HTML inválido na web.
- Campos de texto com fonte **≥ 16 px** (senão o iPhone amplia a tela ao digitar).
- Código específico de plataforma vai em arquivos `nome.web.ts` / `nome.ts`.
- Nunca suba segredos: `.env*`, chaves `service_role`/`secret`, `supabase/.temp/`.

## Código de conduta

Seja respeitoso e gentil. Críticas são sobre o código, nunca sobre pessoas. Comportamentos abusivos levam ao bloqueio no repositório.
