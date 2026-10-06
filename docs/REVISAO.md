# Revisão final do projeto

Revisão feita após a implementação, cobrindo bugs, segurança, experiência e escalabilidade. Tudo marcado como **corrigido** está no código e coberto por teste quando aplicável.

## Problemas encontrados e corrigidos

| # | Área | Problema | Correção |
| --- | --- | --- | --- |
| 1 | Segurança | Escrita direta nas tabelas permitiria burlar regras (ex.: mudar `owner_id`, marcar item de lista alheia) | Revogado `insert/update/delete`; escritas só por RPC com permissão por lista; colunas editáveis liberadas uma a uma. Teste "intrusa com o ID da lista" |
| 2 | Segurança | Código de convite curto pode ser adivinhado | Limite de 10 tentativas inválidas/hora, expiração em 48 h, revogação e aprovação obrigatória do administrador |
| 3 | Segurança | Contador de tentativas seria desfeito se a função lançasse erro (rollback) | `request_join` devolve status em vez de erro, gravando a tentativa |
| 4 | Segurança | `next` após login poderia redirecionar para qualquer rota | `safeNext` aceita apenas `/join/XXXX-9999` |
| 5 | Privacidade | Foto de perfil poderia apontar para URL externa (rastreamento de IP de quem visualiza) | `check` só aceita arquivos do próprio usuário no bucket `avatars` |
| 6 | Privacidade | Perfis visíveis a qualquer usuário autenticado | `can_see_profile`: apenas quem divide lista (ou admin vendo pedido de entrada) |
| 7 | Privacidade | Dados da conta anterior ficariam no aparelho após logout | Cache, fila offline e token de push apagados ao sair |
| 8 | Dados | Edição simultânea sobrescreveria o valor do outro | Merge de 3 vias com `base`; conflito devolvido ao app e resolvido pelo usuário |
| 9 | Dados | Reenvio da fila offline duplicaria itens/mensagens | IDs gerados no aparelho + RPC idempotentes |
| 10 | Dados | Item criado e removido sem internet geraria chamadas inúteis/erros | A fila cancela o par localmente |
| 11 | Dados | Evento realtime atrasado poderia "voltar" um preço antigo | Descartado pela `version` |
| 12 | Dados | Refetch apagaria da tela alterações ainda na fila | Consultas reaplicam a fila sobre o retorno do servidor |
| 13 | Dados | Eventos perdidos durante queda do realtime | Recarga automática ao reconectar |
| 14 | Dados | Logout com alterações não enviadas perderia dados sem aviso | Confirmação antes de sair |
| 15 | Realtime | Duas telas da mesma lista abertas na pilha disputavam o mesmo tópico de canal | Canal de dados com tópico único por tela; presença em canal separado |
| 16 | Remoção | `DELETE` no realtime não respeita filtro por lista | Remoção lógica (`deleted_at`) gera `UPDATE` filtrado e preserva o histórico |
| 17 | UX | Aba "Compras" redirecionando criaria laço ao voltar | Tela de escolha da lista com "Começar/Continuar compras" |
| 18 | UX | Pedido de aprovação continuaria "pendente" para outros após resposta | Notificações relacionadas marcadas como lidas na resposta |
| 19 | UX | Formulários reabriam com dados antigos | Formulários montados com `key` a cada abertura (sem efeitos que copiam estado) |
| 20 | UX | Toque em notificação de mensagem abria detalhes do produto | Abre direto a aba de conversa |
| 21 | UX | Recuperação de senha por link falha quando o e-mail é aberto em outro aparelho | Código de 6 dígitos digitado no app |
| 22 | UX | Mensagens técnicas ("Error 500") | Tradução centralizada em `src/lib/errors.ts`; teste garante que "500" não aparece |
| 23 | Qualidade | Totais calculados de forma diferente no app e no banco | Mesmas regras em `lib/totals.ts` e `list_summaries`, testadas com o mesmo cenário |

## Segunda revisão — uso em qualquer dispositivo, de graça

| # | Área | Problema | Correção |
| --- | --- | --- | --- |
| 24 | Plataforma | Só rodava como app nativo; sem acesso pelo navegador | Versão web (react-native-web) com PWA: manifest, ícones, service worker offline, layout centralizado no computador |
| 25 | Web | App inteiro em branco no navegador: `useLastNotificationResponse` não existe na web | Hook por plataforma `useNotificationTap` (`.web.ts` sem push nativo) e handler de notificação só no celular |
| 26 | Web | `Alert.alert` com botões não faz nada no navegador: excluir lista, sair, remover participante, logout com pendências e excluir conta não funcionavam | `showDialog` + `DialogHost`: alerta nativo no celular, diálogo próprio na web |
| 27 | Web | "Compartilhar" não fazia nada em navegadores de computador | Sem Web Share API, o convite é copiado e o usuário é avisado |
| 28 | Convites | Link de convite aberto sem login perdia o código no redirecionamento | Convite pendente guardado (memória + sessionStorage) e aplicado após entrar/criar conta |
| 29 | Convites | Links `junto://` só abrem com o app instalado | Na web o link usa o endereço do site (`https://…/join/CODIGO`); no nativo, `EXPO_PUBLIC_INVITE_BASE_URL` |
| 30 | Privacidade (LGPD) | Sem política de leitura no Storage, `list()` voltava vazio: fotos antigas e as da conta excluída nunca eram apagadas | Política "avatar: dono lista" (migração `…05_fixes.sql`) |
| 31 | Dev local | URL de foto exigia `https://`, quebrando o upload no Supabase local (`http://127.0.0.1`) | Restrição aceita `http(s)` mantendo "só arquivos do próprio usuário" |
| 32 | Custo | Projeto Free do Supabase pausa após ~7 dias sem uso | RPC `keepalive()` (não expõe dados) + workflow agendado no GitHub Actions |
| 33 | Custo/escala | Tabelas de notificações e tentativas de convite só cresciam | Limpeza diária automática via `pg_cron` |
| 34 | Ambiente | `test:db` exigia PostgreSQL instalado | PGlite (Postgres em WASM) — roda em qualquer SO só com `npm install` |
| 35 | Ícones | Ícones/splash eram os padrões do Expo | Ícones gerados a partir do logo do Junto (Android adaptativo, iOS, splash, favicon, PWA) |
| 36 | UX | "Sair da lista" sem confirmação | Confirmação antes de sair |
| 37 | Configuração | Configuração manual do `.env` | `npm run setup` valida as chaves (recusa a `service_role`) e testa a conexão |
| 38 | Web | Botão "Criar conta" da tela de login não navegava no navegador (`<Link asChild>` com o `Button`) | `router.push` direto no `onPress` |
| 39 | Convites | O convite pendente era apagado durante a renderização; numa segunda renderização sumia e o usuário ia para a Início | Layout só lê (`peekPendingInvite`); a tela do convite apaga ao abrir |
| 40 | Web | Folhas inferiores (adicionar produto, preço, conflito) ocupavam a tela inteira no computador | Limitadas à coluna do app (560 px) |

## Terceira revisão — uso real no celular pela rede, tablet e computador

| # | Área | Problema relatado | Causa encontrada | Correção |
| --- | --- | --- | --- | --- |
| 41 | Itens e chat | Adicionar item e enviar mensagem davam erro no celular | O app gera o ID de cada item/mensagem com `crypto.randomUUID`, que o navegador **só oferece em HTTPS/localhost**. Aberto por `http://IP-do-computador`, a função não existe | `uuid()` usa `crypto.getRandomValues` (existe em qualquer página) — `src/lib/uuid.ts` |
| 42 | QR Code | Câmera não abria | Câmera ao vivo (`getUserMedia`) também é exclusiva de HTTPS; o leitor ainda baixava o WebAssembly de um CDN externo | Sem HTTPS: **"Tirar foto do QR Code"** (abre a câmera traseira pelo seletor de arquivo) e "Escolher imagem", com leitura no aparelho. Com HTTPS/app: câmera ao vivo, pedido de permissão e instruções/atalho para Configurações se negada. Leitor servido pelo próprio site (`public/zxing_reader.wasm`) |
| 43 | Pedido de acesso | Mensagem de erro e, logo depois, a pessoa conectada | Aviso de pedido já respondido continuava com "Aceitar" na central (o app só ouvia notificações novas, não as resolvidas) e responder de novo gerava `request_not_found` | Resposta idempotente no banco (mesmo sentido = sucesso silencioso); central ouve atualizações das notificações e recarrega ao abrir |
| 44 | Unidade | Obrigatória | Coluna `not null default 'un'` com 8 valores fixos e app sempre enviando uma | Migração `…06_optional_unit.sql`: unidade opcional, sugeridas (un, kg, g, L, ml, pct, cx, dz) ou "Outros" com texto livre (até 15 caracteres); seletor `UnitPicker` (toque de novo para remover) |
| 45 | Responsividade | Layout fixo de celular | Coluna fixa de 560 px só na web | Área de até 1080 px em tablet/computador (web e nativo), formulários numa coluna de 720 px, Início em 1/2/3 colunas; iPad habilitado e rotação liberada |
| 46 | Teclado | Campos e botões escondidos pelo teclado | Chrome no Android não encolhe a página por padrão; Safari no iPhone desloca a página; barra de abas subia com o teclado | `interactive-widget=resizes-content`, altura do app acompanha a área visível (`visualViewport`), campo focado rolado para a tela, barra de abas some com o teclado, rolagem ajusta ao teclado no iOS |
| 47 | Chat (computador) | Enter não enviava | — | Enter envia, Shift+Enter quebra linha; falha de envio vira aviso (a mensagem fica no campo) |
| 48 | Remover item | Após remover um item aberto por link, a tela dizia "pode ter sido removido por outro participante" | Não havia tela anterior para voltar | Volta para a lista quando não há histórico |
| 49 | Teste na rede | Era preciso editar o IP no `.env.local` | — | Com Supabase local, o app usa automaticamente o endereço pelo qual foi aberto (`resolveSupabaseUrl`) |
| 50 | Copiar código | Dizia "copiado" mesmo quando a cópia falhava | Resultado da cópia era ignorado | Confere o resultado e orienta quando não copia |

## Quarta revisão — zoom no celular, fotos no chat e notificações

| # | Área | Problema / pedido | Causa encontrada | Solução |
| --- | --- | --- | --- | --- |
| 51 | Zoom no celular | Tela ampliada ao enviar mensagens; era preciso diminuir o zoom à mão | O campo do chat usava fonte de 15 px. iPhone (Safari e PWA instalado) **amplia a página ao focar campo com fonte < 16 px** e não volta. Não era configuração do PWA nem do viewport | Fonte de 16 px no chat; regra global (telas de toque) que garante 16 px em todo campo; no iOS, `maximum-scale=1` (lá o zoom com dois dedos continua possível); sem zoom por toque duplo (`touch-action: manipulation`); sem aumento de texto ao girar |
| 52 | Chat | Tirar foto, escolher da galeria, pré-visualizar | — | Botões de câmera (traseira) e galeria; pré-visualização com legenda opcional, "Escolher outra" e "Cancelar"; foto reduzida no aparelho (lado maior 1600 px, JPEG) antes do envio; aparece na hora com "enviando…"; toque para ampliar |
| 53 | Fotos — segurança | — | — | Bucket **privado** `chat-images` (só participantes da lista leem, por URL temporária); envio só por quem pode conversar; o banco recusa mensagem com foto que não foi enviada pela própria pessoa ou de outra lista; fotos apagadas ao excluir a lista |
| 54 | Fotos — web | Redução falhava na web | Bug do `expo-image-manipulator` na web: redimensionar informando `height: null` divide por zero; e ele processa pixel a pixel na CPU (lento em fotos de 12 MP) | Na web, redução pelo canvas do navegador (rápida); no app nativo, manipulator informando só o lado necessário |
| 55 | Alertas | Excluir deslizando; excluir uma ou todas | — | Deslizar para a esquerda ou direita (toque e mouse, Expo Go e web, sem biblioteca nativa nova), botão de lixeira em cada aviso, "Limpar todas" com confirmação, **Desfazer** por 5 s; exclusão vale em todos os aparelhos (RPC `delete_notifications`) |
| 56 | Alertas | Aviso "botão dentro de botão" e cabeçalho cortado no celular | Lixeira e botões de ação dentro do botão do aviso (HTML inválido); três itens numa linha de 375 px | Botões lado a lado; ações do cabeçalho numa segunda linha |
| 57 | Adicionar produto | Unidade sempre aberta, preço escondido em "+ opções", botões de adicionar no fim da folha | — | "+ Unidade (opcional)" vira botão que abre as opções e mostra a escolha ("Unidade: kg"); Preço estimado ao lado da Quantidade (com dica "por kg"); botões fixos no rodapé da folha, sempre visíveis — empilhados no celular (principal em cima), lado a lado em telas largas; lista mostra "R$ 5,99/kg" em vez de "cada" quando há unidade; mesma ordem na edição |

## Verificações executadas

- `npm run typecheck` — TypeScript estrito, sem erros
- `npm run lint` — sem erros nem avisos
- `npm test` — 91 testes passando
- `npm run test:db` — 23 cenários passando (PGlite) e também no Supabase local real (Postgres 17, `npx supabase start`): as 5 migrações aplicam sem erro, `pg_cron` agenda a limpeza e `delete_my_account` apaga de `auth.users`
- Quarta revisão, no navegador em tamanho de celular com o Supabase local: campos com 16 px efetivos; foto de 3000×4000 "tirada" pela câmera (seletor com `capture=environment`) → pré-visualização → legenda → enviada (1200×1600, 23 KB) → exibida para a outra pessoa em tempo real; acesso à foto sem login negado; deslizar remove o aviso, Desfazer restaura (nada apagado no servidor), lixeira apaga no servidor após o prazo, "Limpar todas" zera tela, contador e banco; nenhum botão aninhado nas telas principais. O zoom automático do iPhone e o teclado virtual não podem ser reproduzidos neste ambiente: a correção segue a regra documentada dos navegadores (fonte ≥ 16 px) e deve ser conferida no aparelho
- Terceira revisão, no navegador com o Supabase local, **reproduzindo a condição do celular sem HTTPS** (sem `crypto.randomUUID` e sem câmera ao vivo): adicionar item sem unidade e com unidade livre, editar, remover, chat nos dois sentidos em tempo real com Enter, QR Code lido de uma foto (seletor pedindo a câmera traseira) até abrir o convite, pedido de acesso aceito sem erro e sem aviso pendente duplicado; Início medida em 375, 768, 812 (deitado) e 1366 px sem transbordar. Não foi possível abrir um teclado virtual real neste ambiente — a adaptação ao teclado foi implementada pelas APIs padrão dos navegadores e deve ser conferida num celular
- Ponta a ponta no navegador com duas contas no Supabase local: cadastro, login, criar lista, adicionar produto, gerar convite, abrir link sem login → criar conta/entrar → pedido enviado, pedido aparecendo em tempo real para a administradora, aceitar, item marcado como comprado refletido ao vivo na outra conta, chat entre as duas, menu e confirmação de exclusão (cancelada) na web
- `npm run build:web` — site gerado; servido localmente: rotas diretas (`/join/…`), manifest, service worker e convite pendente verificados no navegador, sem erros no console
- `npx expo export --platform android` — bundle gerado com sucesso (todas as rotas e importações resolvem)

## Limitações conhecidas (não bloqueiam o MVP)

| Item | Situação | Sugestão |
| --- | --- | --- |
| Teclado no Android | Usa `softwareKeyboardLayoutMode: resize`; validar em aparelhos com edge-to-edge | Se o campo ficar coberto, adotar `react-native-keyboard-controller` |
| Limite de envio de mensagens/itens por usuário | Não há *rate limit* por usuário além do Auth | Contador por minuto nas RPC ou Supabase API Gateway |
| Links `https://` abrindo o app nativo | Abrem a versão web; abrir direto no app instalado exige App/Universal Links | Ver [CONFIGURACAO.md](CONFIGURACAO.md#5-links-de-convite-clicáveis-opcional) |
| Push na versão web | No navegador os avisos chegam pela central de notificações e em tempo real com o site aberto, sem push com o site fechado | Web Push (VAPID) numa evolução futura |
| Leitor de QR Code na web | Depende de câmera e HTTPS; no computador use "Digitar código" ou o link | — |
| Exclusão de conta | `delete from auth.users` numa função `security definer`. Se a política do seu projeto Supabase não permitir, mova para uma Edge Function com `supabase.auth.admin.deleteUser` | — |
| Push de mensagens | Toda mensagem gera push | Agrupar/silenciar quando o destinatário está com o chat aberto |
| Offline para convites, aprovações e finalização | Exigem conexão (mensagem clara) | Adequado: dependem de outra pessoa |
| Escala do realtime | `postgres_changes` atende milhares de usuários | Migrar para *Broadcast from Database* acima disso |
| Fotos | Bucket público com nome aleatório | Bucket privado + URLs assinadas se exigido |
| Backups no plano Free | Sem backup automático | `npx supabase db dump -f backup.sql` periodicamente |

## Próximos passos sugeridos

1. Testes com 3–5 casais/famílias reais por duas semanas (roteiro em [DESENVOLVIMENTO.md](DESENVOLVIMENTO.md#teste-manual-de-colaboração-roteiro)).
2. Monitoramento de erros (Sentry) e métricas de uso.
3. Testes ponta a ponta (Maestro) para o fluxo de convite e modo mercado.
4. Funcionalidades: itens recorrentes ("comprar de novo"), responsável por item na interface, sugestões com IA usando `activity_log`.
