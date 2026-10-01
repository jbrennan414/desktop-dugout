import { App } from "aws-cdk-lib";
import { DesktopDugoutStack } from "./stack.js";
import {
  DesktopDugoutSiteCertStack,
  DesktopDugoutSiteStack,
} from "./site-stack.js";

const app = new App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const primaryRegion = process.env.CDK_DEFAULT_REGION ?? "us-west-2";
const tags = {
  project: "desktop-dugout",
  managed_by: "cdk",
};

new DesktopDugoutStack(app, "DesktopDugoutBackend", {
  env: { account, region: primaryRegion },
  description: "Desktop Dugout scoreboard backend",
  tags,
});

// CloudFront requires ACM certs in us-east-1 — this stack holds ONLY the cert.
const siteCert = new DesktopDugoutSiteCertStack(app, "DesktopDugoutSiteCert", {
  env: { account, region: "us-east-1" },
  description: "ACM cert for desktopdugout.com (CloudFront requires us-east-1)",
  tags,
});

new DesktopDugoutSiteStack(app, "DesktopDugoutSite", {
  env: { account, region: primaryRegion },
  description: "Desktop Dugout marketing site (S3 + CloudFront + Route53)",
  certificate: siteCert.certificate,
  tags,
});
