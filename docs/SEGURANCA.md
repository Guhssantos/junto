# Segurança e privacidade

## Princípios

1. **Conhecer o ID não dá acesso.** Toda leitura passa por RLS: só membros com `status = 'active'` veem uma lista e tudo ligado a ela (produtos, mensagens, aprovações, histórico, totais). Testado em `supabase/tests/01_security_and_flows.test.sql`.
2. **O app não escreve direto nas tabelas sensíveis.** `insert/update/delete` foram revogados; escritas passam por funções RPC que verificam permissão por lista, validam dados e registram histórico. Exceções mínimas, por coluna: nome/foto do próprio perfil, dados descritivos da lista (com `list.update`), `read_at` das próprias notificações.
3. **Autorização no servidor, interface só esconde botões.** `usePermissions` é apenas conveniência visual.
4. **Nada para anônimos.** A role `anon` não tem acesso a tabelas nem funções.

## Autenticação e tokens

- Supabase Auth com JWT de 1 h e *refresh token* rotativo (reuso detectado invalida a sessão).
- Sessão guardada no **Keychain (iOS) / Keystore (Android)** via `expo-secure-store` (`src/lib/secureStorage.ts`).
- Senha: mínimo 8 caracteres com letras e números (validado no app e no Auth).
- Recuperação por **código de 6 dígitos** com validade de 1 hora (não depende de links que podem ser interceptados).
- Logout encerra só a sessão do aparelho, remove o token de push e apaga o cache local.
- Recomendado em produção: SMTP próprio, CAPTCHA no cadastro (Auth → Bot protection) e proteção contra senhas vazadas (plano Pro).

## Convites

| Risco | Mitigação |
| --- | --- |
| Adivinhar código (24⁴ × 10⁴ ≈ 3,3 bilhões) | máximo de 10 códigos inválidos por usuário por hora (`invite_attempts`) + limites do Auth para criar contas |
| Código vazado | expira em 48 h, pode ser revogado ("Gerar novo código") |
| Entrar sem permissão | entrar exige **aprovação do administrador**; até lá o usuário não vê nada da lista |
| Redirecionamento malicioso após login | `safeNext` só aceita rotas `/join/XXXX-9999` |
| QR Code de terceiros | o leitor só aceita QR Codes com código no formato do Junto |

## Validação de dados

- Restrições no banco (`check`): tamanhos de texto, quantidade > 0, preços ≥ 0, unidades e tipos permitidos.
- RPC valida campos permitidos em `update_product` e converte erros em `invalid_input`.
- App valida antes de enviar (zod e funções de `src/lib`), com mensagens em português.

## Logs e auditoria

`activity_log` registra criação de lista, convites gerados/revogados, entradas, remoções, mudanças de papel, preços, compras, aprovações e finalização — com autor e horário. Visível aos membros da lista.

## Edge Function de push

Chamada apenas pelo banco, com segredo compartilhado (`x-webhook-secret`) comparado em tempo constante. Usa a `service_role` somente no servidor. Falhas de push nunca bloqueiam a operação principal.

## Privacidade e LGPD

- **Minimização:** coletamos nome, e-mail, foto opcional e o conteúdo das listas.
- **Visibilidade:** nome e foto aparecem somente para quem divide lista com o usuário (`can_see_profile`).
- **Fotos:** nome de arquivo aleatório; URL só é exposta pelo perfil protegido por RLS. Para sigilo total, troque o bucket para privado e use URLs assinadas.
- **Exclusão:** Perfil → Excluir minha conta remove foto, perfil e conta; listas compartilhadas passam ao participante mais antigo; mensagens e histórico ficam anônimos.
- **Dados no aparelho:** apagados ao sair da conta.
- **Hospedagem:** crie o projeto Supabase na região São Paulo.

Antes de publicar comercialmente: escreva Política de Privacidade e Termos de Uso (exigidos pelas lojas), defina a base legal (execução de contrato), um canal para o titular exercer direitos (e-mail do encarregado/DPO) e revise com um profissional jurídico. Esta documentação não substitui orientação jurídica.

## Checklist antes de produção

- [ ] `service_role` nunca no app nem no repositório
- [ ] SMTP próprio configurado e templates em português
- [ ] CAPTCHA no cadastro
- [ ] Segredos do push no Vault e na Edge Function
- [ ] Backups diários (plano Pro) e PITR se necessário
- [ ] Política de Privacidade publicada e linkada nas lojas
