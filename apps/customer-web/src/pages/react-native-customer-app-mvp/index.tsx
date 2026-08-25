import React from 'react';
import { ReactNativeCustomerAppMvpComponent } from '../../components/react-native-customer-app-mvp/ReactNativeCustomerAppMvpComponent';
import { useReactNativeCustomerAppMvp } from '../../hooks/useReactNativeCustomerAppMvp';

const ReactNativeCustomerAppMvpPage = () => {
  const mobile = useReactNativeCustomerAppMvp();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-600">Mobile MVP</p>
          <h1 className="text-3xl font-bold text-slate-900">React Native customer app launch surface</h1>
          <p className="mt-2 text-slate-600">Preview the mobile screen set, push readiness and deep link coverage for the Craves customer app.</p>
        </header>
        <ReactNativeCustomerAppMvpComponent {...mobile} />
      </div>
    </main>
  );
};

export default ReactNativeCustomerAppMvpPage;
