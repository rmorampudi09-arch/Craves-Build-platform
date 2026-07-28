import { OrderTrackingForm } from '@/components/order-tracking-form';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center px-5 py-12 sm:px-8">
      <div className="grid w-full gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#F6B545]">Craves</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">Track food made with care, from the chef to your door.</h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300">This Next.js customer shell introduces the secure delivery-tracking experience. Sign-in, browsing, cart, checkout and profile migration continue as separate modules.</p>
        </section>
        <section className="rounded-[30px] bg-[#FFF8EC] p-7 text-slate-950 shadow-2xl shadow-black/30 sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#6930CA]">Delivery tracking</p>
          <h2 className="mt-3 text-3xl font-bold">Find your order</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">You must be signed in as the customer who placed the order. Craves verifies ownership before showing delivery details.</p>
          <OrderTrackingForm />
        </section>
      </div>
    </main>
  );
}
