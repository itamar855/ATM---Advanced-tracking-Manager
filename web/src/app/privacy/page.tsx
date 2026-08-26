export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-3xl mx-auto py-16 px-6 text-[var(--color-text-secondary)] space-y-6">
      <h1 className="text-3xl font-bold text-[var(--color-text-primary)]">Política de Privacidade — ATM Tracking</h1>
      <p className="text-sm">Última atualização: 26 de Agosto de 2026</p>
      
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">1. Coleta e Uso de Dados</h2>
        <p className="text-sm leading-relaxed">
          O ATM (Advanced Tracking Manager) coleta dados estritamente necessários para viabilizar a mensuração de conversões publicitárias via Meta Conversions API (CAPI). Todos os dados pessoais (PII) são hasheados com SHA-256 no servidor antes de qualquer transmissão.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">2. Integração com o Facebook Login e Graph API</h2>
        <p className="text-sm leading-relaxed">
          Utilizamos a autenticação OAuth da Meta exclusivamente para consultar contas de anúncio autorizadas pelo usuário e sincronizar métricas agregadas de campanhas. Não compartilhamos dados com terceiros.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">3. Exclusão de Dados</h2>
        <p className="text-sm leading-relaxed">
          O usuário pode solicitar a exclusão total de seus dados ou desconectar suas contas a qualquer momento através do painel de controle ou pelo e-mail de suporte.
        </p>
      </section>
    </div>
  );
}
