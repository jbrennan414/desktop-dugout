import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import {
  Certificate,
  CertificateValidation,
  type ICertificate,
} from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  CachePolicy,
  CachedMethods,
  Distribution,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  PriceClass,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import {
  AaaaRecord,
  ARecord,
  HostedZone,
  type IHostedZone,
  RecordTarget,
} from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { BucketDeployment, Source } from "aws-cdk-lib/aws-s3-deployment";
import type { Construct } from "constructs";

const ROOT_DOMAIN = "desktopdugout.com";
const WWW_DOMAIN = `www.${ROOT_DOMAIN}`;
const HOSTED_ZONE_ID = "Z01949272RCL6DAO8ZOTW";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE_DIST = resolve(HERE, "..", "..", "site", "dist");

function lookupHostedZone(scope: Construct, id: string): IHostedZone {
  return HostedZone.fromHostedZoneAttributes(scope, id, {
    hostedZoneId: HOSTED_ZONE_ID,
    zoneName: ROOT_DOMAIN,
  });
}

/**
 * Cert-only stack. Lives in us-east-1 because CloudFront requires ACM certs
 * there — no other resources belong in this region.
 */
export class DesktopDugoutSiteCertStack extends Stack {
  readonly certificate: ICertificate;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, { ...props, crossRegionReferences: true });

    const hostedZone = lookupHostedZone(this, "HostedZone");

    this.certificate = new Certificate(this, "SiteCert", {
      domainName: ROOT_DOMAIN,
      subjectAlternativeNames: [WWW_DOMAIN],
      validation: CertificateValidation.fromDns(hostedZone),
    });
  }
}

export interface DesktopDugoutSiteStackProps extends StackProps {
  certificate: ICertificate;
}

export class DesktopDugoutSiteStack extends Stack {
  constructor(scope: Construct, id: string, props: DesktopDugoutSiteStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true });

    const hostedZone = lookupHostedZone(this, "HostedZone");

    const siteBucket = new Bucket(this, "SiteBucket", {
      bucketName: `desktopdugout-site-${this.account}-${this.region}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const securityHeaders = new ResponseHeadersPolicy(this, "SiteSecurityHeaders", {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
    });

    const distribution = new Distribution(this, "SiteDistribution", {
      comment: "Desktop Dugout marketing site",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: CachedMethods.CACHE_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: Duration.minutes(5),
        },
      ],
      domainNames: [ROOT_DOMAIN, WWW_DOMAIN],
      certificate: props.certificate,
      priceClass: PriceClass.PRICE_CLASS_100,
    });

    new BucketDeployment(this, "SiteDeployment", {
      sources: [Source.asset(SITE_DIST)],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
      prune: true,
    });

    const aliasTarget = RecordTarget.fromAlias(new CloudFrontTarget(distribution));

    new ARecord(this, "ApexAliasA", {
      zone: hostedZone,
      target: aliasTarget,
    });
    new AaaaRecord(this, "ApexAliasAAAA", {
      zone: hostedZone,
      target: aliasTarget,
    });
    new ARecord(this, "WwwAliasA", {
      zone: hostedZone,
      recordName: "www",
      target: aliasTarget,
    });
    new AaaaRecord(this, "WwwAliasAAAA", {
      zone: hostedZone,
      recordName: "www",
      target: aliasTarget,
    });

    new CfnOutput(this, "SiteUrl", {
      value: `https://${ROOT_DOMAIN}`,
    });
    new CfnOutput(this, "SiteBucketName", {
      value: siteBucket.bucketName,
    });
    new CfnOutput(this, "SiteDistributionId", {
      value: distribution.distributionId,
    });
  }
}
