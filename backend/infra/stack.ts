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
  CfnStage,
  DomainName,
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
} from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {
  Certificate,
  CertificateValidation,
} from "aws-cdk-lib/aws-certificatemanager";
import {
  AllowedMethods,
  CachePolicy,
  CachedMethods,
  Distribution,
  PriceClass,
  ViewerProtocolPolicy,
} from "aws-cdk-lib/aws-cloudfront";
import { S3BucketOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { AttributeType, BillingMode, Table } from "aws-cdk-lib/aws-dynamodb";
import { Rule, Schedule } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Runtime, Architecture } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  AaaaRecord,
  ARecord,
  HostedZone,
  RecordTarget,
} from "aws-cdk-lib/aws-route53";
import { ApiGatewayv2DomainProperties } from "aws-cdk-lib/aws-route53-targets";
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from "aws-cdk-lib/aws-s3";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";

const ROOT_DOMAIN = "desktopdugout.com";
const API_DOMAIN = `api.${ROOT_DOMAIN}`;
const HOSTED_ZONE_ID = "Z01949272RCL6DAO8ZOTW";
const FIRMWARE_BUCKET_NAME = "desktopdugout-firmware";
const FIRMWARE_POINTER_PARAM = "/desktop-dugout/firmware/latest";

const HERE = dirname(fileURLToPath(import.meta.url));
const HANDLERS = resolve(HERE, "..", "src", "handlers");

export class DesktopDugoutStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const devicesTable = new Table(this, "DevicesTable", {
      tableName: "desktop-dugout-devices",
      partitionKey: { name: "device_id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const gameStatesTable = new Table(this, "GameStatesTable", {
      tableName: "desktop-dugout-game-states",
      partitionKey: { name: "team_id", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Placeholder for the eventual real provider's credentials.
    // Empty JSON; populated manually before switching SCORE_PROVIDER off "mock".
    new Secret(this, "ProviderApiKey", {
      secretName: "desktop-dugout/provider-api-key",
      description: "Score data provider API key (populate before use)",
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const commonEnv = {
      DEVICES_TABLE: devicesTable.tableName,
      GAME_STATES_TABLE: gameStatesTable.tableName,
      SCORE_PROVIDER: "mlb",
    };

    const bundling = {
      format: OutputFormat.ESM,
      target: "node20",
      minify: false,
      sourceMap: true,
      mainFields: ["module", "main"],
      externalModules: ["@aws-sdk/*"],
    };

    const makeFn = (
      logicalId: string,
      entryFile: string,
      opts: { memorySize: number; timeoutSeconds: number },
    ): NodejsFunction => {
      const logGroup = new LogGroup(this, `${logicalId}Logs`, {
        logGroupName: `/aws/lambda/desktop-dugout-${logicalId}`,
        retention: RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      return new NodejsFunction(this, logicalId, {
        entry: resolve(HANDLERS, entryFile),
        handler: "handler",
        runtime: Runtime.NODEJS_22_X,
        architecture: Architecture.ARM_64,
        memorySize: opts.memorySize,
        timeout: Duration.seconds(opts.timeoutSeconds),
        environment: commonEnv,
        logGroup,
        bundling,
      });
    };

    const registerDeviceFn = makeFn("RegisterDeviceFn", "register-device.ts", {
      memorySize: 256,
      timeoutSeconds: 10,
    });
    devicesTable.grantReadWriteData(registerDeviceFn);

    const getDeviceStateFn = makeFn("GetDeviceStateFn", "get-device-state.ts", {
      memorySize: 256,
      timeoutSeconds: 10,
    });
    devicesTable.grantReadData(getDeviceStateFn);
    gameStatesTable.grantReadData(getDeviceStateFn);

    const pollProviderFn = makeFn("PollProviderFn", "poll-provider.ts", {
      memorySize: 512,
      timeoutSeconds: 30,
    });
    gameStatesTable.grantReadWriteData(pollProviderFn);

    const getTeamStateFn = makeFn("GetTeamStateFn", "get-team-state.ts", {
      memorySize: 256,
      timeoutSeconds: 10,
    });
    gameStatesTable.grantReadWriteData(getTeamStateFn);

    // ---------- Firmware distribution ----------

    const firmwareBucket = new Bucket(this, "FirmwareBucket", {
      bucketName: FIRMWARE_BUCKET_NAME,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const firmwareCdn = new Distribution(this, "FirmwareDistribution", {
      comment: "Desktop Dugout firmware distribution",
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(firmwareBucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: CachedMethods.CACHE_GET_HEAD,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
      },
      priceClass: PriceClass.PRICE_CLASS_100,
    });

    const firmwarePointer = new StringParameter(this, "FirmwarePointer", {
      parameterName: FIRMWARE_POINTER_PARAM,
      description: "Latest firmware {version, sha256} — flipped by publish-firmware script",
      stringValue: JSON.stringify({ version: "none", sha256: "" }),
    });

    const getFirmwareLatestFn = makeFn("GetFirmwareLatestFn", "get-firmware-latest.ts", {
      memorySize: 128,
      timeoutSeconds: 5,
    });
    getFirmwareLatestFn.addEnvironment("FIRMWARE_POINTER_PARAM", FIRMWARE_POINTER_PARAM);
    getFirmwareLatestFn.addEnvironment("FIRMWARE_CDN_HOST", firmwareCdn.domainName);
    firmwarePointer.grantRead(getFirmwareLatestFn);

    new Rule(this, "PollScheduleRule", {
      ruleName: "desktop-dugout-poll-schedule",
      description: "Fires the score-provider poll Lambda",
      schedule: Schedule.rate(Duration.minutes(1)),
      targets: [new LambdaFunction(pollProviderFn)],
    });

    const hostedZone = HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
      hostedZoneId: HOSTED_ZONE_ID,
      zoneName: ROOT_DOMAIN,
    });

    const apiCert = new Certificate(this, "ApiCert", {
      domainName: API_DOMAIN,
      validation: CertificateValidation.fromDns(hostedZone),
    });

    const apiDomain = new DomainName(this, "ApiCustomDomain", {
      domainName: API_DOMAIN,
      certificate: apiCert,
    });

    const httpApi = new HttpApi(this, "HttpApi", {
      apiName: "desktop-dugout-api",
      corsPreflight: {
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
        allowHeaders: ["authorization", "content-type"],
        allowOrigins: ["*"],
      },
      defaultDomainMapping: {
        domainName: apiDomain,
      },
    });

    const apiAccessLogs = new LogGroup(this, "ApiAccessLogs", {
      logGroupName: "/aws/apigateway/desktop-dugout-access",
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    apiAccessLogs.addToResourcePolicy(
      new PolicyStatement({
        actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
        principals: [new ServicePrincipal("apigateway.amazonaws.com")],
        resources: [`${apiAccessLogs.logGroupArn}:*`],
      }),
    );
    const cfnStage = httpApi.defaultStage!.node.defaultChild as CfnStage;
    cfnStage.accessLogSettings = {
      destinationArn: apiAccessLogs.logGroupArn,
      format: JSON.stringify({
        requestId: "$context.requestId",
        requestTime: "$context.requestTime",
        ip: "$context.identity.sourceIp",
        userAgent: "$context.identity.userAgent",
        method: "$context.httpMethod",
        path: "$context.path",
        routeKey: "$context.routeKey",
        status: "$context.status",
        protocol: "$context.protocol",
        responseLength: "$context.responseLength",
        integrationLatency: "$context.integrationLatency",
      }),
    };

    const apiAliasTarget = RecordTarget.fromAlias(
      new ApiGatewayv2DomainProperties(
        apiDomain.regionalDomainName,
        apiDomain.regionalHostedZoneId,
      ),
    );

    new ARecord(this, "ApiAliasA", {
      zone: hostedZone,
      recordName: "api",
      target: apiAliasTarget,
    });

    new AaaaRecord(this, "ApiAliasAAAA", {
      zone: hostedZone,
      recordName: "api",
      target: apiAliasTarget,
    });

    httpApi.addRoutes({
      path: "/devices/register",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("RegisterDeviceInt", registerDeviceFn),
    });

    httpApi.addRoutes({
      path: "/devices/{id}/state",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("GetDeviceStateInt", getDeviceStateFn),
    });

    httpApi.addRoutes({
      path: "/firmware/latest",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("GetFirmwareLatestInt", getFirmwareLatestFn),
    });

    httpApi.addRoutes({
      path: "/{teamId}",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("GetTeamStateInt", getTeamStateFn),
    });

    new CfnOutput(this, "ApiUrl", {
      value: httpApi.apiEndpoint,
      description: "Auto-generated execute-api URL of the Desktop Dugout HTTP API",
    });

    new CfnOutput(this, "ApiCustomUrl", {
      value: `https://${API_DOMAIN}`,
      description: "Custom-domain URL of the Desktop Dugout HTTP API",
    });

    new CfnOutput(this, "FirmwareBucketName", {
      value: firmwareBucket.bucketName,
      description: "S3 bucket holding versioned firmware binaries",
    });

    new CfnOutput(this, "FirmwarePointerName", {
      value: firmwarePointer.parameterName,
      description: "SSM parameter holding the latest firmware pointer",
    });

    new CfnOutput(this, "FirmwareCdnHost", {
      value: firmwareCdn.domainName,
      description: "CloudFront domain that serves firmware binaries to devices",
    });
  }
}
