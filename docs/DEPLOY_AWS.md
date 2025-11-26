# Deploying to AWS App Runner via ECR

This guide walks you through deploying the Open-LLM-VTuber backend to AWS App Runner using Amazon ECR.

## Prerequisites

1. AWS CLI installed and configured (`aws configure`)
2. Docker installed and running
3. AWS account with appropriate permissions (ECR, App Runner, IAM)

## Step 1: Create ECR Repository

```bash
# Set your AWS region and account ID
export AWS_REGION=us-east-1  # Change to your preferred region
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO_NAME=open-llm-vtuber-backend

# Create the ECR repository
aws ecr create-repository \
    --repository-name $ECR_REPO_NAME \
    --region $AWS_REGION \
    --image-scanning-configuration scanOnPush=true
```

## Step 2: Authenticate Docker with ECR

```bash
# Get ECR login token
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
```

## Step 3: Build and Tag the Docker Image

```bash
# Navigate to backend directory
cd backend

# Build the image
docker build -t ${ECR_REPO_NAME}:latest -f dockerfile .

# Tag the image for ECR (using variable to avoid expansion issues)
ECR_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:latest"
docker tag ${ECR_REPO_NAME}:latest ${ECR_IMAGE_URI}
```

## Step 4: Push Image to ECR

```bash
# Push the image
docker push ${ECR_IMAGE_URI}
```

## Step 5: Create App Runner Service

### Option A: Using AWS Console

1. Go to AWS App Runner console
2. Click "Create service"
3. Choose "Container registry" → "Amazon ECR"
4. Select your ECR repository and image tag
5. Configure:
   - **Service name**: `open-llm-vtuber-backend`
   - **Virtual CPU**: 2 vCPU (minimum recommended)
   - **Memory**: 4 GB (minimum recommended)
   - **Port**: `12393`
   - **Environment variables**: Add from your `.env` file:
     - `PYTHONUNBUFFERED=1`
     - `PYTHONDONTWRITEBYTECODE=1`
     - `HF_HOME=/app/models`
     - `MODELSCOPE_CACHE=/app/models`
     - `OPENAI_API_KEY=your-key-here` (or use Secrets Manager)
     - `GEMINI_API_KEY=your-key-here` (if using Gemini)
     - `ELEVENLABS_API_KEY=your-key-here` (if using ElevenLabs)
6. Configure auto-deployment (optional)
7. Review and create

### Option B: Using AWS CLI

```bash
# Create apprunner-service.json configuration
cat > apprunner-service.json <<EOF
{
  "ServiceName": "open-llm-vtuber-backend",
  "SourceConfiguration": {
    "ImageRepository": {
      "ImageIdentifier": "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME:latest",
      "ImageConfiguration": {
        "Port": "12393",
        "RuntimeEnvironmentVariables": {
          "PYTHONUNBUFFERED": "1",
          "PYTHONDONTWRITEBYTECODE": "1",
          "HF_HOME": "/app/models",
          "MODELSCOPE_CACHE": "/app/models"
        }
      },
      "ImageRepositoryType": "ECR"
    },
    "AutoDeploymentsEnabled": true
  },
  "InstanceConfiguration": {
    "Cpu": "2 vCPU",
    "Memory": "4 GB",
    "InstanceRoleArn": "arn:aws:iam::$AWS_ACCOUNT_ID:role/apprunner-service-role"
  },
  "HealthCheckConfiguration": {
    "Protocol": "HTTP",
    "Path": "/health",
    "Interval": 10,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 5
  }
}
EOF

# Create the service (requires IAM role - see below)
aws apprunner create-service \
    --cli-input-json file://apprunner-service.json \
    --region $AWS_REGION
```

## Step 6: Create IAM Role for App Runner (if needed)

```bash
# Create trust policy
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "build.apprunner.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

# Create the role
aws iam create-role \
    --role-name apprunner-service-role \
    --assume-role-policy-document file://trust-policy.json

# Attach ECR access policy
aws iam attach-role-policy \
    --role-name apprunner-service-role \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
```

## Step 7: Configure Secrets (Recommended)

For sensitive data like API keys, use AWS Secrets Manager:

```bash
# Create secret for API keys
aws secretsmanager create-secret \
    --name open-llm-vtuber-secrets \
    --secret-string '{
      "OPENAI_API_KEY": "your-key",
      "GEMINI_API_KEY": "your-key",
      "ELEVENLABS_API_KEY": "your-key"
    }' \
    --region $AWS_REGION

# Then reference in App Runner environment variables or use IAM role
```

## Step 8: Update App Runner Service (for changes)

```bash
# After pushing new image, trigger deployment
aws apprunner start-deployment \
    --service-arn arn:aws:apprunner:$AWS_REGION:$AWS_ACCOUNT_ID:service/open-llm-vtuber-backend/xxxxx \
    --region $AWS_REGION
```

## Important Notes for App Runner

1. **Storage**: App Runner has ephemeral storage. For persistent data (models, cache), consider:
   - Using S3 for model storage
   - Using EFS for shared storage
   - Downloading models on startup

2. **Configuration Files**: Since `conf.yaml` is mounted as a volume in docker-compose, you'll need to:
   - Either bake it into the image, or
   - Use environment variables to override config, or
   - Store config in S3 and download on startup

3. **Model Storage**: Large models should be stored in S3 and downloaded on container startup, or use EFS.

4. **Health Check**: The `/health` endpoint is already configured in the dockerfile.

## Quick Deploy Script

Save this as `deploy.sh`:

```bash
#!/bin/bash
set -e

export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR_REPO_NAME=open-llm-vtuber-backend

echo "Building Docker image..."
docker build -t ${ECR_REPO_NAME}:latest -f dockerfile .

echo "Logging into ECR..."
aws ecr get-login-password --region ${AWS_REGION} | \
    docker login --username AWS --password-stdin \
    ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

echo "Tagging image..."
ECR_IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}:latest"
docker tag ${ECR_REPO_NAME}:latest ${ECR_IMAGE_URI}

echo "Pushing to ECR..."
docker push ${ECR_IMAGE_URI}

echo "Deployment complete! Image URI:"
echo "${ECR_IMAGE_URI}"
```

Make it executable: `chmod +x deploy.sh`

## Troubleshooting

- **Image too large**: Consider using multi-stage builds or compressing models
- **Startup timeout**: Increase health check timeout in App Runner config
- **Memory issues**: Increase App Runner instance memory
- **Port issues**: Ensure App Runner is configured to use port 12393

