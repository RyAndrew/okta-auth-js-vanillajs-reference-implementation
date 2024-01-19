"use strict";

const config = {
  useInteractionCodeFlow:false,  //okta-auth-js equivalent of "useClassicEngine:true" for sign in widget
  issuer: 'https://mycompany.okta.com/oauth2/ausakx85dmHwzI7D3697',
  clientId: '0oaakx7nlnnddPXz7497',
  redirectUri: 'https://myapp.mycompany.com/',
  scopes: ['openid','profile','email','offline_access'],
  //expireEarlySeconds: 60, //DEV on localhost only! // default 30
  services: {
    autoRenew: true, //automatically renew refresh tokens when they are close to expiration
    autoRemove: true, //automatically remove expired tokens
    syncStorage: true, //sync tokens between browser tabs
  },
}
