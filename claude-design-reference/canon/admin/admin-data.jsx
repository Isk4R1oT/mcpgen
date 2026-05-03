// admin-data.jsx — mock data for ops console
// Internal staff perspective. Entities link to each other by id.

window.ADM_DATA = (() => {
  // ── Users ──────────────────────────────────────────────────────────
  const users = [
    { id: 'u_8f12', name: 'mira chen',        email: 'mira@lumen.dev',          org: 'lumen-payments',     role: 'owner',  status: 'active',     plan: 'team',      created: '2024-03-12', lastSeen: '2 min ago',  mfa: true,  servers: 4, spend: '$487.20', country: 'CA' },
    { id: 'u_2a91', name: 'kenji tanaka',     email: 'kenji@hartline.io',        org: 'hartline',          role: 'admin',  status: 'active',     plan: 'team',      created: '2024-08-04', lastSeen: '14 min ago', mfa: true,  servers: 2, spend: '$214.00', country: 'JP' },
    { id: 'u_4b78', name: 'priya rao',        email: 'priya@northwind.co',       org: 'northwind-shop',    role: 'owner',  status: 'flagged',    plan: 'pro',       created: '2024-11-22', lastSeen: '1 hr ago',   mfa: false, servers: 12,spend: '$2,304.00', country: 'IN' },
    { id: 'u_9c34', name: 'theo park',        email: 'theo@solidset.studio',     org: 'solidset',          role: 'member', status: 'active',     plan: 'free',      created: '2025-01-05', lastSeen: '3 hr ago',   mfa: true,  servers: 1, spend: '$0.00',   country: 'US' },
    { id: 'u_6d12', name: 'noor abadi',       email: 'noor@grove.ai',            org: 'grove',             role: 'admin',  status: 'active',     plan: 'enterprise',created: '2023-06-18', lastSeen: '5 min ago',  mfa: true,  servers: 28,spend: '$8,940.00', country: 'AE' },
    { id: 'u_3e44', name: 'ben holmes',       email: 'ben@indielabs.dev',        org: 'indielabs',         role: 'owner',  status: 'suspended',  plan: 'team',      created: '2024-04-30', lastSeen: '6 days ago', mfa: false, servers: 0, spend: '$0.00',   country: 'GB' },
    { id: 'u_7f88', name: 'hana kowalski',    email: 'hana@klipo.io',            org: 'klipo',             role: 'owner',  status: 'active',     plan: 'team',      created: '2024-09-12', lastSeen: '22 min ago', mfa: true,  servers: 3, spend: '$398.00', country: 'PL' },
    { id: 'u_1g23', name: 'lucas oliveira',   email: 'lucas@ferrobank.com',      org: 'ferrobank',         role: 'admin',  status: 'active',     plan: 'enterprise',created: '2023-11-04', lastSeen: '8 min ago',  mfa: true,  servers: 16,spend: '$5,120.00', country: 'BR' },
    { id: 'u_5h67', name: 'asha mehta',       email: 'asha@dotsight.tools',      org: 'dotsight',          role: 'member', status: 'pending',    plan: 'team',      created: '2025-04-29', lastSeen: 'never',      mfa: false, servers: 0, spend: '$0.00',   country: 'IN' },
    { id: 'u_2j89', name: 'finn larsen',      email: 'finn@northcraft.no',       org: 'northcraft',        role: 'owner',  status: 'active',     plan: 'pro',       created: '2024-07-19', lastSeen: '1 day ago',  mfa: true,  servers: 2, spend: '$92.00',  country: 'NO' },
  ];

  // ── Servers (MCPs) ─────────────────────────────────────────────────
  const servers = [
    { id: 's_lp01', name: 'lumen-payments-mcp',  org: 'lumen-payments',     ownerId: 'u_8f12', tools: 23, status: 'live',        version: '2.4.1', region: 'multi', deploys: 142, p95: '184ms', errorRate: '0.04%', invocations24: '12,408', drift: false, listed: true,  featured: true,  flags: 0 },
    { id: 's_lp02', name: 'lumen-refunds-mcp',   org: 'lumen-payments',     ownerId: 'u_8f12', tools: 8,  status: 'live',        version: '1.2.0', region: 'us',    deploys: 38,  p95: '92ms',  errorRate: '0.01%', invocations24: '3,940',  drift: false, listed: true,  featured: false, flags: 0 },
    { id: 's_hl01', name: 'hartline-orders',     org: 'hartline',          ownerId: 'u_2a91', tools: 14, status: 'live',        version: '3.1.0', region: 'apac',  deploys: 88,  p95: '142ms', errorRate: '0.12%', invocations24: '8,124',  drift: true,  listed: true,  featured: false, flags: 0 },
    { id: 's_nw01', name: 'northwind-shopify',   org: 'northwind-shop',    ownerId: 'u_4b78', tools: 31, status: 'flagged',     version: '1.0.4', region: 'us',    deploys: 4,   p95: '420ms', errorRate: '2.4%',  invocations24: '14,002', drift: false, listed: true,  featured: false, flags: 3 },
    { id: 's_gv01', name: 'grove-knowledge',     org: 'grove',             ownerId: 'u_6d12', tools: 18, status: 'live',        version: '4.0.0', region: 'multi', deploys: 240, p95: '78ms',  errorRate: '0.02%', invocations24: '42,180', drift: false, listed: true,  featured: true,  flags: 0 },
    { id: 's_gv02', name: 'grove-rag-private',   org: 'grove',             ownerId: 'u_6d12', tools: 6,  status: 'live',        version: '2.1.0', region: 'eu',    deploys: 19,  p95: '156ms', errorRate: '0.08%', invocations24: '6,400',  drift: false, listed: false, featured: false, flags: 0 },
    { id: 's_ss01', name: 'solidset-figma',      org: 'solidset',          ownerId: 'u_9c34', tools: 11, status: 'live',        version: '0.9.0', region: 'us',    deploys: 7,   p95: '210ms', errorRate: '0.30%', invocations24: '420',    drift: false, listed: true,  featured: false, flags: 0 },
    { id: 's_kp01', name: 'klipo-clip-tools',    org: 'klipo',             ownerId: 'u_7f88', tools: 9,  status: 'incident',    version: '1.4.2', region: 'us',    deploys: 22,  p95: '912ms', errorRate: '8.2%',  invocations24: '1,204',  drift: false, listed: true,  featured: false, flags: 0 },
    { id: 's_fb01', name: 'ferrobank-statements',org: 'ferrobank',         ownerId: 'u_1g23', tools: 22, status: 'live',        version: '5.2.1', region: 'sa',    deploys: 168, p95: '102ms', errorRate: '0.03%', invocations24: '24,800', drift: false, listed: false, featured: false, flags: 0 },
    { id: 's_il01', name: 'indielabs-shop',      org: 'indielabs',         ownerId: 'u_3e44', tools: 7,  status: 'suspended',   version: '0.4.0', region: 'us',    deploys: 2,   p95: '—',     errorRate: '—',     invocations24: '0',      drift: false, listed: false, featured: false, flags: 1 },
    { id: 's_ds01', name: 'dotsight-traces',     org: 'dotsight',          ownerId: 'u_1g23', tools: 5,  status: 'pending',     version: '0.1.0', region: 'us',    deploys: 0,   p95: '—',     errorRate: '—',     invocations24: '0',      drift: false, listed: false, featured: false, flags: 0 },
    { id: 's_nc01', name: 'northcraft-erp',      org: 'northcraft',        ownerId: 'u_2j89', tools: 19, status: 'live',        version: '2.0.1', region: 'eu',    deploys: 51,  p95: '188ms', errorRate: '0.06%', invocations24: '2,940',  drift: true,  listed: true,  featured: false, flags: 0 },
  ];

  // ── Moderation queue (marketplace) ─────────────────────────────────
  const moderation = [
    { id: 'm_4001', kind: 'new-listing',  serverId: 's_ss01', org: 'solidset',       title: 'solidset-figma',     reason: 'first publish', submitted: '2 min ago',  reporter: '—', priority: 'med' },
    { id: 'm_4002', kind: 'report',       serverId: 's_nw01', org: 'northwind-shop', title: 'northwind-shopify',  reason: 'misleading description · claims paid features that don\'t exist', submitted: '14 min ago', reporter: '@maxlee', priority: 'high' },
    { id: 'm_4003', kind: 'abuse',        serverId: 's_nw01', org: 'northwind-shop', title: 'northwind-shopify',  reason: 'pii in tool docs (sample customer email exposed)', submitted: '18 min ago', reporter: 'auto-scan', priority: 'high' },
    { id: 'm_4004', kind: 'badge-request',serverId: 's_lp01', org: 'lumen-payments', title: 'lumen-payments-mcp', reason: 'requesting "verified publisher" badge', submitted: '1 hr ago',   reporter: '—', priority: 'low' },
    { id: 'm_4005', kind: 'update',       serverId: 's_gv01', org: 'grove',         title: 'grove-knowledge',     reason: 'major version 4.0.0 — breaking changes', submitted: '3 hr ago',  reporter: '—', priority: 'med' },
    { id: 'm_4006', kind: 'report',       serverId: 's_kp01', org: 'klipo',         title: 'klipo-clip-tools',    reason: 'high error rate · users reporting timeouts', submitted: '4 hr ago',  reporter: '@anish', priority: 'high' },
    { id: 'm_4007', kind: 'takedown-req', serverId: 's_il01', org: 'indielabs',     title: 'indielabs-shop',      reason: 'suspected stripe key in plaintext', submitted: '6 hr ago',  reporter: 'auto-scan', priority: 'critical' },
    { id: 'm_4008', kind: 'new-listing',  serverId: 's_ds01', org: 'dotsight',      title: 'dotsight-traces',     reason: 'first publish', submitted: '8 hr ago', reporter: '—', priority: 'med' },
  ];

  // ── Regions / infra ────────────────────────────────────────────────
  const regions = [
    { id: 'sfo', name: 'sfo · san francisco',   provider: 'fly',    status: 'healthy',  servers: 142, p95: '78ms',  errorRate: '0.02%', traffic: '38%', lastDeploy: '2 min ago' },
    { id: 'iad', name: 'iad · ashburn',         provider: 'aws',    status: 'healthy',  servers: 98,  p95: '64ms',  errorRate: '0.01%', traffic: '24%', lastDeploy: '8 min ago' },
    { id: 'cdg', name: 'cdg · paris',           provider: 'fly',    status: 'degraded', servers: 88,  p95: '342ms', errorRate: '1.4%',  traffic: '14%', lastDeploy: '14 min ago' },
    { id: 'fra', name: 'fra · frankfurt',       provider: 'aws',    status: 'healthy',  servers: 76,  p95: '92ms',  errorRate: '0.03%', traffic: '12%', lastDeploy: '3 min ago' },
    { id: 'sin', name: 'sin · singapore',       provider: 'fly',    status: 'healthy',  servers: 54,  p95: '102ms', errorRate: '0.04%', traffic: '8%',  lastDeploy: '5 min ago' },
    { id: 'syd', name: 'syd · sydney',          provider: 'aws',    status: 'maint',    servers: 22,  p95: '—',     errorRate: '—',     traffic: '0%',  lastDeploy: 'maintenance window' },
    { id: 'gru', name: 'gru · são paulo',       provider: 'fly',    status: 'healthy',  servers: 31,  p95: '128ms', errorRate: '0.06%', traffic: '4%',  lastDeploy: '12 min ago' },
  ];

  // ── Recent deploys ─────────────────────────────────────────────────
  const deploys = [
    { id: 'd_a912', server: 'lumen-payments-mcp',  version: '2.4.1', sha: 'a91c4e2', who: 'mira@lumen.dev',     when: '2 min ago',  result: 'success', regions: ['sfo','iad','fra'], duration: '34s' },
    { id: 'd_b401', server: 'grove-knowledge',     version: '4.0.0', sha: 'b401de8', who: 'noor@grove.ai',      when: '8 min ago',  result: 'success', regions: ['sfo','fra','sin'], duration: '52s' },
    { id: 'd_c882', server: 'klipo-clip-tools',    version: '1.4.2', sha: 'c882a90', who: 'hana@klipo.io',      when: '14 min ago', result: 'failed',  regions: ['sfo'],             duration: '12s' },
    { id: 'd_d013', server: 'hartline-orders',     version: '3.1.0', sha: 'd013aa1', who: 'kenji@hartline.io',  when: '22 min ago', result: 'success', regions: ['sin'],             duration: '28s' },
    { id: 'd_e445', server: 'ferrobank-statements',version: '5.2.1', sha: 'e445b09', who: 'lucas@ferrobank.com',when: '1 hr ago',   result: 'success', regions: ['gru'],             duration: '41s' },
    { id: 'd_f100', server: 'northwind-shopify',   version: '1.0.4', sha: 'f100221', who: 'priya@northwind.co', when: '2 hr ago',   result: 'rolled-back', regions: ['sfo'],         duration: '1m 12s' },
  ];

  // ── Billing events ─────────────────────────────────────────────────
  const billing = [
    { id: 'b_9001', org: 'lumen-payments',  user: 'mira@lumen.dev',          plan: 'team',       mrr: '$487',   status: 'active',  next: 'mar 12', method: 'visa •• 4242', dunning: 0 },
    { id: 'b_9002', org: 'grove',          user: 'noor@grove.ai',           plan: 'enterprise', mrr: '$8,940', status: 'active',  next: 'mar 04', method: 'invoice',      dunning: 0 },
    { id: 'b_9003', org: 'ferrobank',     user: 'lucas@ferrobank.com',      plan: 'enterprise', mrr: '$5,120', status: 'active',  next: 'mar 19', method: 'invoice',      dunning: 0 },
    { id: 'b_9004', org: 'northwind-shop',user: 'priya@northwind.co',       plan: 'pro',        mrr: '$92',    status: 'past-due',next: 'overdue 4d', method: 'mc •• 7782',dunning: 2 },
    { id: 'b_9005', org: 'hartline',     user: 'kenji@hartline.io',         plan: 'team',       mrr: '$214',   status: 'active',  next: 'mar 22', method: 'visa •• 1102', dunning: 0 },
    { id: 'b_9006', org: 'klipo',        user: 'hana@klipo.io',             plan: 'team',       mrr: '$398',   status: 'active',  next: 'mar 28', method: 'visa •• 9090', dunning: 0 },
    { id: 'b_9007', org: 'indielabs',    user: 'ben@indielabs.dev',         plan: 'team',       mrr: '$0',     status: 'cancelled',next: '—',     method: '—',           dunning: 0 },
    { id: 'b_9008', org: 'solidset',     user: 'theo@solidset.studio',      plan: 'free',       mrr: '$0',     status: 'active',  next: '—',      method: '—',           dunning: 0 },
  ];

  // ── LLM ops ────────────────────────────────────────────────────────
  const llmModels = [
    { id: 'sonnet-4.5',     provider: 'anthropic', cost: '$3.00 / mtk', latency: '1.4s', share: 56, errors: '0.4%', primary: true,  status: 'healthy' },
    { id: 'haiku-4.5',      provider: 'anthropic', cost: '$0.25 / mtk', latency: '0.6s', share: 32, errors: '0.2%', primary: false, status: 'healthy' },
    { id: 'opus-4',         provider: 'anthropic', cost: '$15.00 / mtk',latency: '2.8s', share: 8,  errors: '0.5%', primary: false, status: 'healthy' },
    { id: 'gpt-4o',         provider: 'openai',    cost: '$2.50 / mtk', latency: '1.2s', share: 4,  errors: '1.1%', primary: false, status: 'degraded' },
  ];

  const ratePools = [
    { id: 'rp_eval_global', label: 'eval runs (global)',     limit: '60 rpm',   used: 42,  reset: '00:38', tier: 'shared' },
    { id: 'rp_eval_paid',   label: 'eval runs (paid plans)', limit: '240 rpm',  used: 188, reset: '00:38', tier: 'paid' },
    { id: 'rp_compress',    label: 'description compress',   limit: '500 rpm',  used: 312, reset: '00:08', tier: 'system' },
    { id: 'rp_repair',      label: 'spec repair (ai)',       limit: '20 rpm',   used: 6,   reset: '00:38', tier: 'shared' },
  ];

  // ── Feature flags ──────────────────────────────────────────────────
  const flags = [
    { id: 'flag_marketplace_v2', name: 'marketplace_v2',      desc: 'new marketplace IA + autocomplete',          rollout: 100, status: 'on',     owner: 'product', updated: '2 days ago' },
    { id: 'flag_ai_repair',      name: 'ai_repair_inline',    desc: 'inline ai repair on spec parse error',       rollout: 50,  status: 'experiment', owner: 'platform', updated: '4 hr ago' },
    { id: 'flag_eval_v3',        name: 'eval_pipeline_v3',    desc: 'new eval pipeline with sandbox isolation',   rollout: 25,  status: 'experiment', owner: 'platform', updated: '1 day ago' },
    { id: 'flag_drift_pin',      name: 'drift_auto_pin',      desc: 'auto-pin breaking drift to old version',     rollout: 10,  status: 'experiment', owner: 'product', updated: '6 hr ago' },
    { id: 'flag_kill_compress',  name: 'kill_description_compress', desc: 'emergency: stop compressing descriptions', rollout: 0, status: 'killed', owner: 'sre', updated: '30 days ago' },
    { id: 'flag_billing_credits',name: 'self_serve_credits',  desc: 'self-serve credit top-ups',                  rollout: 0,   status: 'off',    owner: 'billing', updated: '2 weeks ago' },
  ];

  // ── Support tickets ────────────────────────────────────────────────
  const tickets = [
    { id: 't_881', subj: 'rollback didn\'t restore 1.2.x — still on 2.0',   user: 'kenji@hartline.io',  priority: 'urgent', status: 'open',     opened: '8 min ago', sla: '52m', assignee: 'jana', plan: 'team' },
    { id: 't_882', subj: 'oauth callback fails on production but works in staging', user: 'priya@northwind.co', priority: 'high',  status: 'waiting', opened: '32 min ago', sla: '3h 28m', assignee: 'rohan', plan: 'pro' },
    { id: 't_883', subj: 'request: increase eval rate-limit on team plan', user: 'mira@lumen.dev',     priority: 'med',    status: 'open',     opened: '1 hr ago',  sla: '11h', assignee: 'unassigned', plan: 'team' },
    { id: 't_884', subj: 'clarify what \'composite tool\' means in pricing',user: 'theo@solidset.studio',priority: 'low',   status: 'open',     opened: '2 hr ago',  sla: '46h', assignee: 'unassigned', plan: 'free' },
    { id: 't_885', subj: 'gdpr export — please ship to my email',          user: 'finn@northcraft.no', priority: 'med',    status: 'in-progress',opened: '3 hr ago',  sla: '21h', assignee: 'jana',  plan: 'pro' },
    { id: 't_886', subj: 'enterprise SOC2 questionnaire — q3 followup',    user: 'lucas@ferrobank.com',priority: 'high',  status: 'in-progress',opened: '4 hr ago',  sla: '20h', assignee: 'kareem',plan: 'enterprise' },
    { id: 't_887', subj: 'invoice overcharged for last billing cycle',     user: 'hana@klipo.io',      priority: 'high',  status: 'open',     opened: '5 hr ago', sla: '7h',  assignee: 'kareem',plan: 'team' },
    { id: 't_888', subj: 'unsuspend my account — false positive',          user: 'ben@indielabs.dev',  priority: 'urgent', status: 'open',     opened: '6 hr ago', sla: '2h',  assignee: 'unassigned', plan: 'team' },
  ];

  // ── Audit log ──────────────────────────────────────────────────────
  const audit = [
    { id: 'a_001', when: '2 min ago',  actor: 'admin@mcpgen',     action: 'user.suspend',         target: 'u_3e44',  diff: { status: ['active','suspended'] }, reason: 'card chargebacks · 3 in 30d' },
    { id: 'a_002', when: '4 min ago',  actor: 'admin@mcpgen',     action: 'server.takedown',      target: 's_il01',  diff: { listed:['true','false'], status:['live','suspended'] }, reason: 'leaked secret in tool description' },
    { id: 'a_003', when: '12 min ago', actor: 'jana@mcpgen',      action: 'billing.refund',       target: 'b_9004',  diff: { amount: ['$0','-$92.00'] }, reason: 'support ticket #t_887' },
    { id: 'a_004', when: '22 min ago', actor: 'kareem@mcpgen',    action: 'flag.toggle',          target: 'flag_ai_repair', diff: { rollout: [25, 50] }, reason: 'experiment ramp' },
    { id: 'a_005', when: '1 hr ago',   actor: 'system',           action: 'region.degrade',       target: 'cdg',     diff: { status: ['healthy','degraded'] }, reason: 'p95 > 300ms threshold for 5 min' },
    { id: 'a_006', when: '2 hr ago',   actor: 'admin@mcpgen',     action: 'user.impersonate',     target: 'u_4b78',  diff: { session: ['—','imp_x4012'] }, reason: 'investigating ticket t_882' },
    { id: 'a_007', when: '3 hr ago',   actor: 'rohan@mcpgen',     action: 'server.republish',     target: 's_hl01',  diff: { version: ['3.0.4','3.1.0'] }, reason: 'force re-publish · cache invalidation' },
    { id: 'a_008', when: '4 hr ago',   actor: 'admin@mcpgen',     action: 'gdpr.export',          target: 'u_2j89',  diff: { export: ['—','exp_aa881'] }, reason: 'support ticket #t_885' },
    { id: 'a_009', when: '5 hr ago',   actor: 'system',           action: 'kill_switch.activate', target: 'flag_kill_compress', diff: { status: ['off','killed'] }, reason: 'auto: error rate > 5% for 2 min' },
  ];

  // ── Integrations ───────────────────────────────────────────────────
  const integrations = [
    { id: 'oauth_github',   name: 'github',     kind: 'oauth',   status: 'healthy',  installs: 4_240, lastSync: '2 min ago', failureRate: '0.01%' },
    { id: 'oauth_google',   name: 'google',     kind: 'oauth',   status: 'healthy',  installs: 2_180, lastSync: '5 min ago', failureRate: '0.04%' },
    { id: 'oauth_slack',    name: 'slack',      kind: 'oauth',   status: 'healthy',  installs: 1_022, lastSync: '14 min ago', failureRate: '0.20%' },
    { id: 'oauth_microsoft',name: 'microsoft',  kind: 'oauth',   status: 'degraded', installs: 612,   lastSync: '1 hr ago',   failureRate: '4.10%' },
    { id: 'wh_stripe',      name: 'stripe webhook', kind: 'webhook', status: 'healthy', installs: 1, lastSync: '8 min ago', failureRate: '0.00%' },
    { id: 'wh_billing',     name: 'billing dunning', kind: 'webhook', status: 'healthy', installs: 1, lastSync: '12 min ago',failureRate: '0.00%' },
    { id: 'wh_alerts',      name: 'pagerduty alerts',kind: 'webhook', status: 'healthy', installs: 1, lastSync: '34 min ago',failureRate: '0.00%' },
  ];

  const secrets = [
    { id: 'sk_anthropic_prod', label: 'anthropic api key (prod)',    last4: '••3a91', rotated: '14 days ago', expires: 'in 76 days', owner: 'platform' },
    { id: 'sk_stripe_prod',    label: 'stripe live key',             last4: '••8b40', rotated: '32 days ago', expires: 'no expiry',  owner: 'billing'  },
    { id: 'sk_postgres_main',  label: 'postgres connection (main)',  last4: '••0c12', rotated: '4 days ago',  expires: 'no expiry',  owner: 'platform' },
    { id: 'sk_redis_cache',    label: 'redis cache token',           last4: '••2d44', rotated: '8 days ago',  expires: 'no expiry',  owner: 'platform' },
    { id: 'sk_aws_deploy',     label: 'aws deploy iam',              last4: '••f100', rotated: '90 days ago', expires: 'in 3 days',  owner: 'sre',     warn: true },
  ];

  // ── Content ────────────────────────────────────────────────────────
  const content = {
    docs: [
      { id: 'doc_quickstart', title: 'quickstart',                   path: '/docs/quickstart',           updated: '2 days ago', author: 'rohan',  status: 'published' },
      { id: 'doc_auth',       title: 'auth strategies',              path: '/docs/auth',                 updated: '1 week ago', author: 'jana',   status: 'published' },
      { id: 'doc_drift',      title: 'understanding drift',          path: '/docs/spec-drift',           updated: '3 days ago', author: 'mira',   status: 'draft' },
      { id: 'doc_eval',       title: 'how eval pass-rate is scored', path: '/docs/eval-scoring',         updated: 'today',      author: 'kareem', status: 'published' },
      { id: 'doc_mp',         title: 'publishing to marketplace',    path: '/docs/marketplace/publish',  updated: '6 days ago', author: 'rohan',  status: 'review' },
    ],
    emails: [
      { id: 'em_welcome',     subject: 'welcome to mcpgen',                                      sentLast24: 142,  openRate: '64%' , clickRate: '22%', updated: '1 week ago' },
      { id: 'em_first_deploy',subject: 'your first server is live 🎉',                          sentLast24: 38,   openRate: '78%' , clickRate: '41%', updated: '2 weeks ago' },
      { id: 'em_dunning_1',   subject: 'we couldn\'t process your card',                         sentLast24: 4,    openRate: '52%' , clickRate: '28%', updated: '3 days ago' },
      { id: 'em_dunning_3',   subject: 'final notice — your account will be suspended in 24 hr',sentLast24: 1,    openRate: '88%' , clickRate: '64%', updated: '3 days ago' },
      { id: 'em_eval_done',   subject: 'your eval suite passed',                                 sentLast24: 24,   openRate: '60%' , clickRate: '34%', updated: '1 week ago' },
      { id: 'em_drift',       subject: 'spec drift detected on {{server}}',                     sentLast24: 18,   openRate: '74%' , clickRate: '48%', updated: '4 days ago' },
    ],
    listings: [
      { id: 'l_lp01', server: 'lumen-payments-mcp', headline: 'payments, charges, refunds — typed.', status: 'published', updated: '1 day ago', changes: 0 },
      { id: 'l_gv01', server: 'grove-knowledge',    headline: 'rag for your handbooks, indexed.',     status: 'pending-review', updated: '3 hr ago', changes: 4 },
      { id: 'l_nw01', server: 'northwind-shopify',  headline: 'one-shot tools for shopify orders.',   status: 'flagged',   updated: '14 min ago', changes: 1 },
    ],
  };

  // ── Errors / observability ─────────────────────────────────────────
  const errors = [
    { id: 'e_8801', message: 'TimeoutError: upstream took 30s', count: 412, lastSeen: '1 min ago', service: 'klipo-clip-tools', severity: 'high', firstSeen: '14 min ago' },
    { id: 'e_8802', message: 'ENOTFOUND resolving anthropic.com', count: 88, lastSeen: '4 min ago', service: 'eval-runner', severity: 'med', firstSeen: '38 min ago' },
    { id: 'e_8803', message: 'TypeError: Cannot read properties of undefined (reading \'tools\')', count: 24, lastSeen: '14 min ago', service: 'frontend', severity: 'low', firstSeen: '2 hr ago' },
    { id: 'e_8804', message: '429 too many requests · anthropic',  count: 18, lastSeen: '22 min ago', service: 'eval-runner', severity: 'med', firstSeen: '2 hr ago' },
    { id: 'e_8805', message: 'invalid_grant · oauth refresh failed', count: 9,  lastSeen: '34 min ago',service: 'oauth-microsoft', severity: 'med', firstSeen: '3 hr ago' },
    { id: 'e_8806', message: 'connection terminated unexpectedly · postgres', count: 4, lastSeen: '1 hr ago', service: 'api', severity: 'high', firstSeen: '4 hr ago' },
  ];

  return { users, servers, moderation, regions, deploys, billing, llmModels, ratePools, flags, tickets, audit, integrations, secrets, content, errors };
})();

window.fmtCountry = (cc) => ({ CA:'🇨🇦',JP:'🇯🇵',IN:'🇮🇳',US:'🇺🇸',AE:'🇦🇪',GB:'🇬🇧',PL:'🇵🇱',BR:'🇧🇷',NO:'🇳🇴' }[cc] || cc);
