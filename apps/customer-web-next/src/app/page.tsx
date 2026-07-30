import { OrderTrackingForm } from '@/components/order-tracking-form';

const customerLinks = [
  { href: '/discover', label: 'Discover nearby food', description: 'Browse home kitchens and dishes using a location you choose.' },
  { href: '/cart', label: 'Your cart', description: 'Review selected dishes and backend-owned food subtotal.' },
  { href: '/addresses', label: 'Saved addresses', description: 'Manage customer-owned delivery addresses and checkout coordinates.' },
  { href: '/orders', label: 'My orders', description: 'Review chef-specific orders and open delivery tracking.' },
  { href: '/subscriptions/plans', label: 'Meal subscriptions', description: 'Browse active weekly and monthly meal plans.' },
  { href: '/notifications', label: 'Notifications', description: 'Read order and delivery updates.' },
  { href: '/chef', label: 'Chef mode', description: 'Apply as a chef or manage an approved kitchen, menu and orders.' },
  { href: '/sign-in', label: 'Sign in', description: 'Use secure Firebase phone OTP.' }
];

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-12 sm:px-8">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
        <section>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#F6B545]">Craves</p>
          <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight text-white sm:text-6xl">Food from home, with a clear journey to your door.</h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300">Discover nearby home food, build your cart, manage delivery addresses, review orders and subscriptions, follow delivery progress or enter chef mode through the secure Next.js experience.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {customerLinks.map(link => <a key={link.href} href={link.href} className="rounded-[24px] border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"><strong className="text-white">{link.label}</strong><p className="mt-2 text-sm leading-6 text-slate-300">{link.description}</p></a>)}
          </div>
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
