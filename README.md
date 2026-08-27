# Team Workbench

> A bilingual HR operations platform for managing onboarding, offboarding, employee workflows, communication, and the active workforce roster.

[Live App](https://happy-hub-work.lovable.app) · [Lovable Project](https://lovable.dev/projects/36192920-84a8-4f0c-b748-bff9ffe92dab)

## About

Team Workbench is an internal people-operations platform designed for HR teams. It brings the complete employee lifecycle—from onboarding preparation and the first working day to confirmed offboarding—into one organized workspace.

The platform replaces scattered email threads, spreadsheets, and manual follow-ups with a clear view of each person's current stage, upcoming actions, deadlines, owners, and collaborators.

Onboarding and offboarding often involve HR, administration, IT, reception, lab assistants, managers, and external suppliers. Team Workbench makes this cross-functional process more transparent, consistent, and easier to manage.

## Core Features

- Manage onboarding and offboarding for employees, interns, and leased labour
- Track contracts, visas, system access, employee IDs, accounts, IT preparation, payroll emails, and welcome emails
- Monitor workflow progress and target dates for every person
- Compose reusable HR communications in the Email Center
- Maintain an automatic active employee roster based on confirmed onboarding and offboarding
- Search, filter, sort, analyse, and export workforce data
- Assign owners and collaborators while preserving an audit history
- Switch between English and Chinese throughout the application
- Apply role-based and organization-scoped data access

## Active Roster Rules

- A confirmed onboarding enters the active roster on the employee's start date.
- A pending offboarding does not remove the employee.
- A confirmed offboarding keeps the employee in the roster through the last working day and removes them after that date.
- Employee ID is canonical on the Person and is enforced consistently across Employment history by PostgreSQL.

## Technology Stack

| Area | Technology |
| --- | --- |
| Language | TypeScript 5.8 |
| UI | React 19, Tailwind CSS 4, Radix UI, shadcn/ui conventions |
| Full-stack framework | TanStack Start |
| Routing | TanStack Router |
| Server state | TanStack Query |
| Forms and validation | React Hook Form, Zod |
| Build tooling | Vite 8, Nitro |
| Database | PostgreSQL via Supabase |
| Authentication | Supabase Auth |
| Authorization | PostgreSQL Row Level Security, role and organization scopes |
| Storage | Supabase Storage |
| Hosting | Lovable Cloud, connected to this GitHub repository |
| Additional UI libraries | Lucide React, Recharts, Sonner, date-fns |

## Architecture

The React application uses TanStack Start for server rendering and server functions. Authenticated requests are validated on the server and executed against Supabase with the user's access token, allowing PostgreSQL Row Level Security policies to remain the primary data-security boundary.

Database schema changes, policies, workflow automation, and reporting views are versioned in [`supabase/migrations`](./supabase/migrations). Changes pushed to the GitHub `main` branch sync back to the connected Lovable project.

## Local Development

Requirements:

- Node.js 20 or newer
- Bun, or another compatible package manager
- A Supabase project with the included migrations applied

```sh
git clone https://github.com/ruizhangruirui/happy-hub-work-ad8d1c59.git
cd happy-hub-work-ad8d1c59
bun install
bun run dev
```

Create a local `.env` file with the required Supabase configuration:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_URL=your_supabase_url
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` in client-side code or commit it to Git.

Useful commands:

```sh
bun run dev       # Start the development server
bun run build     # Create a production build
bun run preview   # Preview the production build
bun run lint      # Run ESLint
bun run format    # Format the codebase
```

---

## 中文介绍

Team Workbench 是一个为 HR 团队设计的内部人员运营平台，用于集中管理员工、实习生及租赁员工从入职准备、正式入职到离职确认的完整流程。

它将分散在邮件、Excel 表格和不同系统中的工作整合到同一个工作台，让每一位人员目前处于哪个阶段、下一步需要做什么、由谁负责，都能被清楚地查看和追踪。

### 主要功能

- 管理正式员工、实习生及租赁员工的入职与离职事项
- 追踪合同、签证、系统流程、工号、账号、电脑配置及邮件发送进度
- 根据入职日期管理关键时间节点和工作流状态
- 通过 Email Center 管理 Payroll、Welcome 等常用邮件
- 根据确认入职与确认离职状态自动维护在职人员名单
- 支持人员搜索、筛选、排序、基础分析及数据导出
- 记录操作历史，明确事项负责人和协作者
- 支持中英文界面及基于角色的数据权限

Team Workbench 的目标是减少重复操作，让 HR 团队能够更早发现遗漏、更顺畅地协作，并为每一位员工提供稳定、专业的入离职体验。
