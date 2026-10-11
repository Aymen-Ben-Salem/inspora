import { readSponsorBillingAdministration } from "@/features/sponsorship/admin-billing";
import { AdminBillingControls } from "@/components/sponsorship/admin-billing-controls";
import { AdminSponsorAnalytics } from "@/components/sponsorship/admin-analytics";
export default async function Page() {
  const data = await readSponsorBillingAdministration();
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-3xl">Sponsorship billing</h1>
      <p className="mt-3 text-sm text-[#767676]">
        Four structural seats. Pending collection blocks seat reuse. Refunds are
        explicit, separate actions in Stripe.
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {data.seats.map((seat) => (
          <section key={seat.slot} className="rounded border p-4">
            <h2 className="font-medium">Seat {seat.slot}</h2>
            <p className="mt-2 text-sm capitalize">{seat.state}</p>
            {seat.reservedUntil ? (
              <p className="mt-2 text-sm">
                Reserved until {seat.reservedUntil.toISOString()}
              </p>
            ) : null}
            {seat.checkoutId ? (
              <AdminBillingControls checkoutId={seat.checkoutId} />
            ) : null}
          </section>
        ))}
      </div>
      <h2 className="mt-10 text-xl">Payment exceptions</h2>
      {data.exceptions.length ? (
        data.exceptions.map((p) => (
          <section key={p.id} className="mt-4 rounded border p-4">
            <p className="break-all text-sm">
              Checkout {p.id}: {p.exceptionCode}
            </p>
            <AdminBillingControls
              checkoutId={p.id}
              exception={p.exceptionCode === "late_payment_refund_review"}
            />
          </section>
        ))
      ) : (
        <p className="mt-4 text-sm text-[#767676]">
          No recorded payment exceptions.
        </p>
      )}
      <h2 className="mt-10 text-xl">Pending work</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {data.jobs.map((j) => (
          <li key={j.id} className="break-all">
            {j.kind} · {j.state} · {j.attempts} attempts ·{" "}
            {j.errorCode ?? "queued"}
          </li>
        ))}
      </ul>
      <h2 className="mt-10 text-xl">Accounts</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {data.accounts.map((a) => (
          <li key={a.id} className="break-all">
            {a.id} · {a.state} · paid through{" "}
            {a.paidThrough?.toISOString() ?? "—"} ·{" "}
            {a.cancelAtPeriodEnd ? "canceling" : "renewing"}
          </li>
        ))}
      </ul>
      <h2 className="mt-10 text-xl">Sponsor performance</h2>
      {data.accounts.slice(0, 100).map((account) => (
        <div key={account.id}>
          <p className="mt-6 break-all text-sm">
            Account {account.id} · {account.state}
          </p>
          <AdminSponsorAnalytics accountId={account.id} />
        </div>
      ))}
    </main>
  );
}
