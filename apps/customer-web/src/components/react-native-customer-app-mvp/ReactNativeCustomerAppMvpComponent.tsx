import React from 'react';

type Props = {
  screens: string[];
  notificationsPreview: string[];
  deepLinkBaseUrl: string;
};

export const ReactNativeCustomerAppMvpComponent = ({ screens, notificationsPreview, deepLinkBaseUrl }: Props) => (
  <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-xl font-semibold text-slate-900">Customer mobile screens</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {screens.map((screen) => (
          <div key={screen} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
            {screen}
          </div>
        ))}
      </div>
    </div>
    <aside className="space-y-6 rounded-3xl bg-slate-900 p-6 text-white">
      <div>
        <p className="text-sm text-sky-300">Deep links</p>
        <p className="mt-2 font-semibold">{deepLinkBaseUrl}</p>
      </div>
      <div>
        <p className="text-sm text-sky-300">Push preview</p>
        <div className="mt-3 space-y-3">
          {notificationsPreview.map((item) => (
            <div key={item} className="rounded-2xl bg-white/10 p-3 text-sm">{item}</div>
          ))}
        </div>
      </div>
    </aside>
  </section>
);
