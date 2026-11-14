export function requestCatalog(token,fetchSource=fetch){
  // Workers accepts only follow/manual. Reject 3xx in the caller; never forward
  // this catalog-only credential to a redirect destination.
  return fetchSource('https://www.inspora.design/api/inspora/catalog',{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(20000)});
}
