// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChefOnboardingWorkspace } from "@/components/chef-onboarding-workspace";
import { EMPTY_ONBOARDING } from "./chef-onboarding-v2-contract";
vi.mock("@/components/auth/EmailVerificationPanel",()=>({EmailVerificationPanel:()=>null}));
vi.mock("@/components/location/AddressMapPicker",()=>({AddressMapPicker:()=>null}));
const state={enabled:true,legacy:false,version:1,resumeStep:"fssai",submitted:false,phoneNumber:"+919000000000",
  details:{...EMPTY_ONBOARDING,email:"chef@example.test",firstName:"Test",lastName:"Chef",dateOfBirth:"1990-01-01",
    kitchenName:"Saved kitchen",addressLine1:"Test",city:"Hyderabad",state:"Telangana",postalCode:"500001",latitude:17.4,longitude:78.4},
  application:{id:"12345678-1234-4123-8123-123456789012",status:"PENDING",documents:[]},
  documents:[],requiredDocuments:["KITCHEN_PHOTO_1","KITCHEN_PHOTO_2","FSSAI_LICENSE"],
  supportPhone:"8367366787",supportEmail:"support@craves.in"};
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function mount(){return render(React.createElement(ChefOnboardingWorkspace,{fallback:React.createElement("p",null,"Existing Chef workspace")}));}
it("resumes an unfinished FSSAI step on the next mount and exposes real support contacts",async()=>{
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>Response.json(url.includes("/content")?[]:state)));
  const first=mount();
  expect(await screen.findByRole("heading",{name:"FSSAI registration"})).toBeTruthy();
  expect(screen.getByRole("link",{name:"8367366787"}).getAttribute("href")).toBe("tel:8367366787");
  first.unmount();mount();
  expect(await screen.findByRole("heading",{name:"FSSAI registration"})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Submit for admin review"})).toBeNull();
});
it("shows the selected-language empty state without claiming translated or completed content",async()=>{
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>Response.json(url.includes("/content")?[]:state)));
  mount();await screen.findByRole("heading",{name:"FSSAI registration"});
  fireEvent.click(screen.getByRole("button",{name:"Learn how to apply"}));
  await waitFor(()=>expect(screen.getByText(/No articles or videos have been published/)).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Preferred language"),{target:{value:"te"}});
  await waitFor(()=>expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes("language=te"))).toBe(true));
  expect(screen.queryByRole("button",{name:"Submit for admin review"})).toBeNull();
});
it("returns a Chef with fully reviewed onboarding to the established workspace",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...state,legacy:true,resumeStep:"legacy",application:{...state.application,status:"APPROVED"}})));
  mount();expect(await screen.findByText("Existing Chef workspace")).toBeTruthy();
  expect(screen.queryByRole("heading",{name:"FSSAI registration"})).toBeNull();
});

it("explains the missing FSSAI number without submitting or silently repeating the step",async()=>{
  const request=vi.fn<(url:string,options?:RequestInit)=>Promise<Response>>(async(url)=>Response.json(url.includes("/content")?[]:state));
  vi.stubGlobal("fetch",request);mount();
  await screen.findByRole("heading",{name:"FSSAI registration"});
  fireEvent.click(screen.getByRole("button",{name:"Save and continue"}));
  expect(await screen.findByRole("status")).toHaveProperty("textContent",
    "Enter the 14-digit FSSAI registration or licence number to continue.");
  expect(request.mock.calls.every(([,options])=>!options || options.method!=="PUT")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Save progress for later"}));
  expect(await screen.findByText(/Progress saved. You can continue/)).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Submit for admin review"})).toBeNull();
});
it("explains the missing FSSAI document even when a valid number is entered",async()=>{
  const request=vi.fn<(url:string,options?:RequestInit)=>Promise<Response>>(async(url)=>Response.json(url.includes("/content")?[]:state));
  vi.stubGlobal("fetch",request);mount();
  await screen.findByRole("heading",{name:"FSSAI registration"});
  fireEvent.change(screen.getByLabelText("FSSAI registration / licence number"),{target:{value:"12345678901234"}});
  fireEvent.click(screen.getByRole("button",{name:"Save and continue"}));
  expect(await screen.findByRole("status")).toHaveProperty("textContent",
    "Upload your FSSAI registration or licence document to continue. You can save your progress for later.");
  expect(request.mock.calls.every(([,options])=>!options || options.method!=="PUT")).toBe(true);
});

it("lets an approved Chef complete added onboarding and access the existing workspace",async()=>{
  vi.stubGlobal("fetch",vi.fn(async(url:string)=>Response.json(url.includes("/content")?[]:{...state,application:{...state.application,status:"APPROVED"}})));
  mount();await screen.findByRole("heading",{name:"FSSAI registration"});
  fireEvent.click(screen.getByRole("button",{name:"View existing Chef workspace"}));
  expect(await screen.findByText("Existing Chef workspace")).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Continue updated onboarding"}));
  expect(screen.getByRole("heading",{name:"FSSAI registration"})).toBeTruthy();
});
