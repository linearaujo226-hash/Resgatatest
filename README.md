# Resgata+

**Organize suas dívidas. Recupere seu controle.**

Aplicação web para organizar dívidas, acompanhar pagamentos e registrar valores que a pessoa decidiu não apostar.

## Funcionalidades desta etapa
- Cadastro e login com Supabase Auth.
- Painel com valores de dívidas pendentes, vencidas, a vencer e pagas.
- Cadastro, listagem, marcação como paga e exclusão de dívidas.
- Registro e histórico de valores não apostados.
- Atualização do nome no perfil.
- Plano previsto de 7 dias de teste e R$ 9,90/mês; cobrança real ainda não integrada.

## Tecnologias
Next.js 15 App Router, TypeScript strict, Tailwind CSS, Supabase Auth e PostgreSQL.

## Executar localmente
1. Execute `npm install`.
2. Copie `.env.example` para `.env.local`.
3. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Aplique `supabase/migrations/0001_initial_schema.sql` no projeto Supabase se ainda não foi aplicada.
5. Configure os URLs permitidos em Authentication no Supabase.
6. Execute `npm run dev`.

## Verificar
Execute `npm run lint` e `npm run build`.

## Segurança
- Nunca exponha a chave `service_role` em variáveis `NEXT_PUBLIC_`.
- Mantenha Row Level Security (RLS) ativada nas tabelas.
- Verifique se as políticas RLS isolam cada usuário antes de usar dados reais.
- Não execute a migração repetidamente sem conferir as tabelas e políticas existentes.

## Pagamentos
A integração real da InfinityPay, validação de webhooks, criação de cobrança e cancelamento ainda precisam ser implementados no backend. Nunca confie no navegador para definir o estado da assinatura.

## Publicação
Antes de publicar, configure as variáveis de ambiente de produção e teste cadastro, login, acesso aos dados e isolamento entre contas. Confirme a compatibilidade da plataforma de hospedagem escolhida com o modo de execução do Next.js.

<!-- INICIO STATUS VALIDACAO -->
## Estado atual — validação inicial

**Data:** 23/10/2026

### Verificações realizadas
- [x] Compilação de produção (`npm run build`) executada com sucesso na validação inicial.
- [x] Teste HTTP inicial das rotas executado no servidor local do Next.js.
- [x] Git conferido: branch `main`, commit de referência `638ffc9`.
- [x] Busca por arquivos de backup e ZIPs antigos realizada na raiz do projeto.

### Páginas incluídas no teste inicial
- Página inicial (`/`)
- Painel (`/dashboard`)
- Dívidas (`/dividas`)
- Financeiro (`/financeiro`)
- Controle de contas (`/controle-contas`)
- Apostas (`/apostas`)
- Login e cadastro (`/login`, `/register`)
- Perfil e recuperação de senha
- Páginas de serviços

### Limites desta validação
O teste de compilação e as requisições HTTP não comprovam, por si só, o funcionamento completo de autenticação, persistência no banco, pagamentos, formulários, gráficos ou leitura inteligente de PDFs. Esses recursos precisam de testes funcionais específicos.

Para reproduzir a compilação, execute `npm ci` e depois `npm run build`.
<!-- FIM STATUS VALIDACAO -->
