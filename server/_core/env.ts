export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  teamAccessPassword: process.env.TEAM_ACCESS_PASSWORD ?? "",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // TIAB / Octane (Inabox) API — Basic Auth
  TIAB_API_BASE_URL: process.env.TIAB_API_BASE_URL ?? "https://benzine.telcoinabox.com/tiab",
  TIAB_API_USERNAME: process.env.TIAB_API_USERNAME ?? "",
  TIAB_API_PASSWORD: process.env.TIAB_API_PASSWORD ?? "",
  // SendGrid email (outbound alerts)
  SENDGRID_API_KEY: process.env.SendGrid_API ?? "",
  SENDGRID_LOGIN: process.env.SendGrid_Login ?? "",
  SENDGRID_PASSWORD: process.env.SendGrid_Password ?? "",
  SENDGRID_WEBSITE: process.env.SendGrid_Website ?? "",
  // CommsCode Number Manager portal
  COMMS_LOGIN: process.env.CommsCode_NumberManager_Login ?? "",
  COMMS_PASSWORD: process.env.CommsCode_NumberManager_Password ?? "",
  COMMS_ACCOUNT_CODE: process.env.CommsCode_NumberManager_AccountCode ?? "",
  COMMS_WEB_ADDRESS: process.env.CommsCode_NumberManager_WebAddress ?? "https://smileit.numbermanager.com.au",
  // NetSIP / Over the Wire portal
  NETSIP_LOGIN: process.env.NetSIP_SmileTelAPI_Login ?? "",
  NETSIP_PASSWORD: process.env.NetSIP_SmileTelAPI_Password ?? "",
  NETSIP_WEB_ADDRESS: process.env.NetSIP_SmileTelAPI_WebAddress ?? "https://portal.netsip.com.au",
  // SasBoss / Access4 API
  SASBOSS_API_USERNAME: process.env.SasBoss_User ?? "",
  SASBOSS_API_PASSWORD: process.env.SasBoss_Password ?? "",
  SASBOSS_WEB_ADDRESS: process.env.SasBoss_Webaddress ?? "https://www.sasboss.com.au",
  // SasBoss API host and reseller ID (set after IP whitelist is approved)
  SASBOSS_API_HOST: process.env.SasBoss_API_Host ?? "api.sasboss.com.au",
  SASBOSS_RESELLER_ID: process.env.SasBoss_Reseller_ID ?? "",
  SASBOSS_API_USERNAME_KEY: process.env.SasBoss_API_Username ?? "",
  SASBOSS_API_PASSWORD_KEY: process.env.SasBoss_API_Password ?? "",
  // Omada Cloud-Based Controller API (APAC) — production SmileTel org
  OMADA_CLIENT_ID: process.env.SmileTelCLIENTID ?? process.env.OMADA_CLIENT_ID ?? "",
  OMADA_CLIENT_SECRET: process.env.CLIENTSECRET ?? process.env.OMADA_CLIENT_SECRET ?? "",
  OMADA_CONTROLLER_ID: process.env.OMADA_CONTROLLER_ID ?? "",
};
