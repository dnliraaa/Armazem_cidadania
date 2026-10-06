# Checklist do `.env` do Supabase self-hosted

Este arquivo **não substitui** o `.env` de verdade — ele vem do template oficial (`docker/.env.example` dentro do repositório `supabase/supabase`, ver `DEPLOY.md` passo 6). Esta é só a lista do que **precisa de atenção antes de subir em produção**, e por quê.

| Variável | Por que importa |
|---|---|
| `POSTGRES_PASSWORD` | Senha do banco de dados de verdade. Se ficar no valor de exemplo do template, qualquer pessoa que conheça o Supabase self-hosted (é código aberto) sabe a senha padrão — troque por um valor gerado (`openssl rand -base64 24`). |
| `JWT_SECRET` | A chave usada para assinar e validar **todos** os tokens de autenticação do sistema (login dos funcionários). Se vazar ou ficar no valor padrão, qualquer pessoa pode forjar um token válido e se passar por qualquer usuário, inclusive admin. Gere um valor aleatório de pelo menos 32 caracteres e nunca o exponha publicamente. |
| `ANON_KEY` | Chave pública derivada do `JWT_SECRET` (papel `anon`). É usada pelo frontend e fica visível no navegador — não é secreta, mas **precisa** ser gerada a partir do `JWT_SECRET` real que você escolheu, senão a autenticação não bate e nada funciona. |
| `SERVICE_ROLE_KEY` | Chave derivada do `JWT_SECRET` (papel `service_role`) usada **só pelo backend**, nunca pelo frontend. Ela ignora Row Level Security e tem acesso total ao banco — trate como uma senha de root e nunca a exponha no código do frontend ou em repositórios públicos. |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | Login do Supabase Studio (o painel administrativo do banco, das tabelas, etc). Se ficar no padrão, qualquer pessoa que ache o endereço do seu Supabase self-hosted consegue entrar direto no painel do seu banco de produção. |
| `SITE_URL` | URL pública do seu app (ex: `https://app.SEUDOMINIO.com`). O Supabase Auth usa isso para montar links de confirmação/redirecionamento — errado, os fluxos de autenticação podem redirecionar para o lugar errado. |
| `API_EXTERNAL_URL` | URL pública pela qual o Supabase (Kong/API) é acessado de fora (ex: `https://api.SEUDOMINIO.com`). Precisa bater com o domínio real, senão o backend e o frontend não conseguem falar com o Supabase corretamente em produção. |
| `SUPABASE_PUBLIC_URL` | Usada internamente por alguns serviços do próprio Supabase (ex: Studio) para montar links — mantenha igual a `API_EXTERNAL_URL` para evitar comportamento inconsistente. |
| `SMTP_*` (host, porta, usuário, senha, remetente) | Configuração de e-mail do Supabase Auth (recuperação de senha, convites, etc). **Opcional por enquanto** — o sistema hoje não depende de e-mail (os funcionários são criados diretamente pelo admin via `create-admin`/tela de funcionários, com senha definida na hora). Pode deixar como veio no template e revisitar isso se, no futuro, quiser habilitar "esqueci minha senha" por e-mail. |

## Ordem recomendada

1. Gere `POSTGRES_PASSWORD` e `JWT_SECRET` primeiro (valores aleatórios, independentes um do outro).
2. Gere `ANON_KEY` e `SERVICE_ROLE_KEY` **a partir do `JWT_SECRET`** escolhido no passo anterior (ver `DEPLOY.md`, passo 6.1 — são tokens JWT derivados dele, não valores soltos).
3. Defina `DASHBOARD_USERNAME`/`DASHBOARD_PASSWORD`.
4. Ajuste `SITE_URL`, `API_EXTERNAL_URL` e `SUPABASE_PUBLIC_URL` para os domínios reais.
5. Deixe `SMTP_*` para depois, se quiser.
