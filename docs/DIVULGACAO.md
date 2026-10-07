# Divulgação: GitHub e LinkedIn

Material pronto para apresentar o Junto como projeto real de desenvolvimento.

## Vídeos

| Arquivo | Formato | Onde usar |
| --- | --- | --- |
| [`video/junto-40s.mp4`](video/junto-40s.mp4) | Full HD 1920×1080 · 40 s · com trilha sonora | LinkedIn, README, portfólio, YouTube, apresentações |
| [`video/junto-apresentacao.mp4`](video/junto-apresentacao.mp4) | 16:9 · 1min38s | demonstração completa |

Capa: `video/junto-40s-capa.png` (use como miniatura no LinkedIn).

O vídeo tem **trilha sonora original** (120 BPM, composta em código por `video/trilha.mjs`, sem direitos autorais de terceiros) e **efeitos sutis sincronizados com a tela**: toques nos botões, notificações, a sincronização entre os dois celulares e as transições. Não há narração: os textos estão na tela, então o vídeo funciona com ou sem som (o LinkedIn começa sem som).

### Roteiro (40 s)

| Tempo | Cena | Mensagem |
| --- | --- | --- |
| 0–4,5 s | O problema | Lista no papel, preços na memória e dois mercados para comparar |
| 4,5–8 s | Como nasceu | Uma ida ao mercado com a minha mãe |
| 8–11,5 s | O Junto | A lista de compras que vocês fazem juntos, em tempo real |
| 11,5–15 s | 01 · Criar | Nova lista: nome, descrição e data |
| 15–19 s | 02 · Adicionar | Produtos, quantidade, unidade e preço estimado; total calculado na hora |
| 19–22,5 s | Convite | QR Code, link ou código, com aprovação de quem criou a lista |
| 22,5–27,5 s | Tempo real | Gustavo informa o preço no mercado; a Mãe vê na hora, em casa |
| 27,5–31 s | Decidir | "Leva ou não leva?" Quem está em casa aprova ou recusa |
| 31–34,5 s | Comparar | Encontrado × estimado por item; conversa para comprar no outro mercado |
| 34,5–37 s | Diferenciais | Tempo real, preços, aprovação, chat, QR Code, modo mercado, offline, multiplataforma |
| 37–40 s | Encerramento | Da necessidade à tecnologia · stack · link do app e do GitHub |

## Post para o LinkedIn

> Anexe o vídeo diretamente no post (vídeo nativo tem mais alcance que link) e coloque o link do GitHub no primeiro comentário, se preferir.

```text
Tudo começou numa ida ao supermercado com a minha mãe. 🛒

Para descobrir onde cada produto valia mais a pena, a gente pesquisava preços e acabava indo a dois ou mais mercados. A lista ficava no papel, os preços na memória e as decisões ("levo esse ou compro no outro?") espalhadas em mensagens.

Transformei esse problema do dia a dia em um aplicativo: o Junto, uma lista de compras colaborativa em tempo real.

Como funciona:
✅ Você cria a lista e adiciona os produtos com o preço estimado
✅ Convida quem vai comprar com você (QR Code, link ou código)
✅ Quem está no mercado informa o preço encontrado e quem está em casa vê na hora
✅ Achou algo fora da lista ou em promoção? Pergunta antes, e a outra pessoa aprova ou recusa
✅ O app compara preço encontrado × estimado, item por item, e atualiza o total da compra

Por trás:
⚙️ React Native + Expo (Android, iOS e web/PWA com o mesmo código) e TypeScript
⚙️ Supabase: PostgreSQL, Auth, Realtime, Storage e Edge Functions
⚙️ Regras de negócio e segurança no próprio banco (RPC + Row Level Security)
⚙️ Modo offline com fila de sincronização e tratamento de conflitos
⚙️ Testes automatizados (app e banco) e CI/CD com GitHub Actions
⚙️ Publicado de graça no Cloudflare Workers

O código é aberto e o app pode ser usado gratuitamente:
🔗 App: https://junto.gusttavo-ssantos.workers.dev
💻 GitHub: https://github.com/Guhssantos/junto

Feedbacks e contribuições são muito bem-vindos!

#ReactNative #Expo #TypeScript #Supabase #DesenvolvimentoMobile #OpenSource #Portfolio
```

### Versão curta (para a seção "Projetos" do perfil)

**Junto: lista de compras colaborativa em tempo real.** Nasceu de uma necessidade real: fazer compras com a minha mãe comparando preços entre mercados. Duas pessoas acompanham a mesma lista ao mesmo tempo: uma informa o preço no mercado, a outra vê na hora e aprova ou recusa itens. React Native + Expo, TypeScript, Supabase (Realtime, RLS, Edge Functions), modo offline, testes automatizados e CI/CD.

Competências sugeridas: React Native · Expo · TypeScript · Supabase · PostgreSQL · GitHub Actions.

## Configuração do repositório no GitHub

Em **Settings → General** (ou na engrenagem do "About", na página do repositório):

- **Description:** `Lista de compras colaborativa em tempo real: duas pessoas, a mesma lista, preços comparados na hora. React Native + Expo + Supabase.`
- **Website:** `https://junto.gusttavo-ssantos.workers.dev`
- **Topics:** `react-native` `expo` `typescript` `supabase` `realtime` `postgresql` `pwa` `shopping-list` `collaboration` `offline-first` `github-actions`
- **Social preview** (Settings → General → Social preview): envie `docs/video/junto-40s-capa.png`. É a imagem que aparece quando o link do repositório é compartilhado no LinkedIn.
- Fixe o repositório no seu perfil (**Customize your pins**).
