const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function onboardingRoute(method: string, path: string[], admin: boolean): string | null {
  if (path.some((p) => !p || p.includes("/") || p.includes("..") || /[^a-zA-Z0-9-]/.test(p)))
    return null;
  const joined = path.join("/");
  if (!admin) {
    if (!joined && ["GET", "PUT", "PATCH"].includes(method)) return "/chef/onboarding";
    if (["submit", "help"].includes(joined) && method === "POST")
      return "/chef/onboarding/" + joined;
    if(path.length===2 && path[0]==="documents" && UUID.test(path[1]!) && method==="DELETE") return "/chef/onboarding/"+joined;
    if(path.length===3 && path[0]==="documents" && UUID.test(path[1]!) && path[2]==="preview" && method==="GET") return "/chef/onboarding/"+joined;
    if (joined === "content" && method === "GET") return "/chef/onboarding/content";
    if (
      path.length === 3 &&
      path[0] === "content" &&
      UUID.test(path[1]!) &&
      path[2] === "playback" &&
      method === "GET"
    )
      return "/chef/onboarding/" + joined;
  } else {
    if(path.length===3 && path[0]==="applications" && UUID.test(path[1]!) && path[2]==="review" && method==="POST") return "/backoffice/chef-onboarding/"+joined;
    if (
      (joined === "help" && method === "GET") ||
      (joined === "content" && ["GET", "POST"].includes(method))
    )
      return "/backoffice/chef-onboarding/" + joined;
    if (
      path.length === 2 &&
      UUID.test(path[1]!) &&
      ((path[0] === "applications" && method === "GET") || (path[0] === "help" && method === "PUT"))
    )
      return "/backoffice/chef-onboarding/" + joined;
    if (
      path.length === 3 &&
      path[0] === "content" &&
      UUID.test(path[1]!) &&
      ((path[2] === "finalize" && method === "POST") ||
        (path[2] === "publication" && method === "PUT") ||
        (path[2] === "playback" && method === "GET"))
    )
      return "/backoffice/chef-onboarding/" + joined;
  }
  return null;
}
