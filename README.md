# Private5G Cloud Deployment


# Overview  
## This source introduces how to deploy 5G Core on AWS Cloud for a private 5G service and build and operate a CI/CD pipeline.
--------
## Download
```bash
git clone https://github.com/aws-samples/private5g-cloud-deployment.git
```
--------
## Procedure to follow:
### Step1. Pre-install:
Install the CDK
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
source .bashrc

nvm install node
```

```bash
npm install -g aws-cdk
```

Install and configure the AWS CLI
```bash
sudo yum install awscli
```

```bash
aws configure
AWS Access Key ID [None]: [your access key]
AWS Secret Access Key [None]: [your secret access key]
Default region name [None]: [your region]
Default output format [None]: json
```

Download the code
```bash
cd ~
git clone https://github.com/aws-samples/private5g-cloud-deployment.git
```

This project deploys 5G Core using the source code provided by open5gs. 
(https://github.com/open5gs/open5gs)
```bash
cd ~/private5g-cloud-deployment/my_open5gs
git clone https://github.com/open5gs/open5gs.git
rm -rf open5gs/.git/
```

CDK Bootstrap
```bash
cd ~/private5g-cloud-deployment/app-cdk
python3 -m venv .venv
source .venv/bin/activate

# Ensure that Virtual env is applied before the shell prompt.
# (.venv)username@hostname$

pip install -r requirements.txt

cdk bootstrap
```

Install Kubectl
```bash
curl -LO https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl
chmod +x kubectl
sudo mv ./kubectl /usr/local/bin/kubectl
```
--------

### Step2. Configure your infrastructure:
Deploy a VPC, EKS Cluster, and Nodegroup to deploy 5G Core.
```bash
cd ~/private5g-cloud-deployment/app-cdk
source .venv/bin/activate
```

Open the file in the path below and write the value of the user variable in each entry.
Enter the key pair name and AZ information created above, as well as the VPC's CIDR information.
```bash
vi ~/private5g-cloud-deployment/app-cdk/app_cdk/config/variables.json
```

Deploy the VPCs defined by the CDK.
```bash
cd ~/private5g-cloud-deployment/app-cdk/
cdk deploy eks-vpc-cdk-stack
```

Deploy the EKS Cluster defined by the CDK.
The EKS Cluster was created using the CDK to generate the Yaml used for CloudFormation and created using CloudFormation.
```bash
cd ~/private5g-cloud-deployment/app-cdk/
cdk synth eks-infra-cf-stack > ./cf/eks-infra-cf.yaml
aws cloudformation create-stack --stack-name eks-infra-stack --template-body file://./cf/eks-infra-cf.yaml --capabilities CAPABILITY_NAMED_IAM
```

Deploy an EKS Nodegroup.
```bash
cd ~/private5g-cloud-deployment/app-cdk/
cdk deploy eks-vpc-cdk-stack no-multus-nodegroup-stack
```

To use the created EKS Cluster, connect to it using the kubectl command.
```bash
eks_cluster_name=$(aws ssm get-parameters --names "EKSClusterName" | grep "Value" | cut -d'"' -f4)

aws eks update-kubeconfig --name [cluster_name] --region [region]
aws eks update-kubeconfig --name $eks_cluster_name --region us-west-2
```
Use the kubectl command to view the deployed cluster.
```bash
kubectl get svc
```
--------
### Step3. Configure your CI/CD pipeline:
Deploy CodePipeline.
```bash
cd ~/private5g-cloud-deployment/app-cdk/
cdk deploy pipeline-cdk-stack
```

---
### Step4. Deploying 5G core:
Run the command below to get the values to write to your config file.
```bash
NGRoleArn=$(aws ssm get-parameters --names "NGRoleArn" | grep "Value" | cut -d'"' -f4)
echo $NGRoleArn

CodeBuildRoleArn=$(aws ssm get-parameters --names "CodeBuildRoleArn" | grep "Value" | cut -d'"' -f4)
echo $CodeBuildRoleArn
```
<br>
Write the contents of aws-auth-cm.yaml.


```bash
vi ~/private5g-cloud-deployment/app-cdk/eks-config/aws-auth-cm.yaml
```

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: aws-auth
  namespace: kube-system
data:
  mapRoles: |
    - rolearn: arn:aws:iam::[NGRoleArn]
      username: system:node:{{EC2PrivateDNSName}}
      groups:
        - system:bootstrappers
        - system:nodes
    - rolearn: arn:aws:iam::[CodeBuildRoleArn]
      username: CodeBuildRole
      groups:
        - system:masters
```
<br>
Apply aws-auth-cm.yaml.

```bash
cd ~/private5g-cloud-deployment/eks_config
kubectl apply -f aws-auth-cm.yaml
```
<br>
Create a namepsace to deploy the 5G Core to the EKS Cluster.

```bash
kubectl create ns open5gs
```

<br>
Run the command below to see the name of the ECR Repository.

```bash
aws ssm get-parameters --names "EcrRepositoryUri" | grep "Value" | cut -d'"' -f4
```
<br>
Modify Helm files

```bash
cd ~/private5g-cloud-deployment/helm_chart/open5gs-helm-charts_nomultus
vi values.yaml
```

```yaml
[before]
open5gs:
  image:
    repository: [your repository]
    pullPolicy: IfNotPresent
    tag: latest
...

[after]
open5gs:
  image:
    repository: [Your AWS Account].dkr.ecr.us-west-2.amazonaws.com/ecr-cdk-stack-myopen5gs41a0c7ec-by5aqtmexdsx
    pullPolicy: IfNotPresent
    tag: latest
...
```
<br>
Open the Git repo, commit, and push.

```bash
cd ~/private5g-cloud-deployment
rm -rf .git

code_commit_uri=$(aws ssm get-parameters --names "CodeCommitUri" | grep "Value" | cut -d'"' -f4)
echo $code_commit_uri

git remote add origin $code_commit_uri
git remote -v
git status

git add .
git status

git commit -m "Initial Commit"
git status

git push --set-upstream origin main
```

<br>
Verify your 5G Core deployment

```bash
kubectl get po -n open5gs
```

<br>
Register the IP addresses of AMF and UPF in the Route53 private hosting zone.

```bash
upf_ipaddr=$(kubectl -n open5gs exec -ti deploy/core5g-upf-deployment -- ip a | grep "global eth0" | awk '{print $2}' | cut -d '/' -f 1)
echo $upf_ipaddr
amf_ipaddr=$(kubectl -n open5gs exec -ti deploy/core5g-amf-1-deployment -- ip a | grep "global eth0" | awk '{print $2}' | cut -d '/' -f 1)
echo $amf_ipaddr

cd ~/private5g-cloud-deployment/network_config
jq --arg new_ip "$upf_ipaddr" '.Changes[0].ResourceRecordSet.Name = "upf.open5gs.service" |.Changes[0].ResourceRecordSet.ResourceRecords[0].Value = $new_ip' default_resource.json > upf_resource.json
jq --arg new_ip "$amf_ipaddr" '.Changes[0].ResourceRecordSet.Name = "amf.open5gs.service" |.Changes[0].ResourceRecordSet.ResourceRecords[0].Value = $new_ip' default_resource.json > amf_resource.json


amf_zoneid=$(aws route53 list-hosted-zones-by-name --region us-west-2 | grep -B 1 amf | grep Id | cut -d '/' -f 3 | sed 's/"//g;s/,//g')
echo $amf_zoneid
upf_zoneid=$(aws route53 list-hosted-zones-by-name --region us-west-2 | grep -B 1 upf| grep Id | cut -d '/' -f 3 | sed 's/"//g;s/,//g')
echo $upf_zoneid

aws route53 change-resource-record-sets --hosted-zone-id ${upf_zoneid} --region {{region}}   --change-batch file://{{resource_file}}
aws route53 change-resource-record-sets --hosted-zone-id ${upf_zoneid} --region us-west-2   --change-batch file://upf_resource.json
aws route53 change-resource-record-sets --hosted-zone-id ${amf_zoneid} --region us-west-2   --change-batch file://amf_resource.json
```
<br>
Ping to verify that the pod deployed successfully.

```bash
kubectl -n open5gs exec -ti deploy/core5g-smf-deployment bash

# SMF Pod -> UPF Pod
ping 10.1.30.12 

# SMF Pod -> AMF Pod
ping 10.1.30.69
```
------

### Step5. Connect to On-Prem with a VPN:
Deploy a customer VPC
```bash
cd ~/private5g-cloud-deployment/app-cdk/
cdk deploy customer-vpc-cdk-stack
```
<br>
Configure the Transit Gateway and create a VPN

```bash
cd ~/private5g-cloud-deployment/app-cdk/
cdk deploy tgw-vpn-cdk-stack
```
<br>
Configure Routing for VPNs

```bash
cd ~/private5g-cloud-deployment/app-cdk/
cdk deploy vpn-route-cdk-stack
```

------

### Step6. Configure your test environment:
<br>
Configure CGW using StrongSWAN and Quagga.

Here we will follow the guide in the workshop below to configure it.
>AWS VPN Workshop - Build Hybrid network using AWS VPN services
>https://catalog.workshops.aws/aws-vpn-at-a-glance/ko-KR/3-s2svpn/3-1-site2site/2-vpnconnection

```bash
sudo su
vi cgwsetup.sh

#Refer to the workshop above to write cgwsetup.sh

chmod +x cgwsetup.sh
./cgwsetup.sh

sudo strongswan statusall

route

vtysh
show ip bgp
```
<br>
Connect to the CustomerRANInstance using the CustomerGWInstance as a bastion.


```bash
#The local
echo $upf_ipaddr
10.1.30.127

#CustomerRANINstance
ping 10.1.30.127
```

<br>
On the local machine where you ran the CDK, use the command below to determine the IP of the AMF.

```bash
cat ~/private5g-cloud-deployment/helm_chart/open5gs-helm-charts_nomultus/values.yaml | grep amf1 -A6
echo $amf_ipaddr
10.1.30.171
```
<br>
Modify the RAN configuration file

```bash
sudo su
vi ~/UERANSIM/config/open5gs-gnb.yaml
```

```yaml
mcc: '208'          # Modify to same value as left
mnc: '93'           # Modify to same value as left

nci: '0x000000010'  
idLength: 32        
tac: 7              # Modify to same value as left

linkIp: 192.168.2.144   # Write the local IP of the RANInstance
ngapIp: 192.168.2.144   # Write the local IP of the RANInstance
gtpIp: 192.168.2.144    # Write the local IP of the RANInstance

# List of AMF address information
amfConfigs:
  - address: 10.1.30.221 # Write the IP of the AMF.
    port: 38412

# List of supported S-NSSAIs by this gNB
slices:
  - sst: 1

# Indicates whether or not SCTP stream number errors should be ignored.
ignoreStreamIds: true
```
<br>
Modifying UE Settings Files

```bash
vi ~/UERANSIM/config/open5gs-ue.yaml
```

```yaml
# IMSI number of the UE. IMSI = [MCC|MNC|MSISDN] (In total 15 digits)
supi: 'imsi-208930000000031' # Modify to same value as left
# Mobile Country Code value of HPLMN
mcc: '208' # Modify to same value as left
# Mobile Network Code value of HPLMN (2 or 3 digits)
mnc: '93' # Modify to same value as left
# SUCI Protection Scheme : 0 for Null-scheme, 1 for Profile A and 2 for Profile B
protectionScheme: 0
# Home Network Public Key for protecting with SUCI Profile A
homeNetworkPublicKey: '5a8d38864820197c3394b92613b20b91633cbd897119273bf8e4a6f4eec0a650'
# Home Network Public Key ID for protecting with SUCI Profile A
homeNetworkPublicKeyId: 1
# Routing Indicator
routingIndicator: '0000'

# Permanent subscription key
key: '0C0A34601D4F07677303652C0462535B' # Modify to same value as left
# Operator code (OP or OPC) of the UE
op: '63bfa50ee6523365ff14c1f45f88737d' # Modify to same value as left
# This value specifies the OP type and it can be either 'OP' or 'OPC'
opType: 'OPC'
# Authentication Management Field (AMF) value
amf: '8000'
# IMEI number of the device. It is used if no SUPI is provided
imei: '356938035643803'
# IMEISV number of the device. It is used if no SUPI and IMEI is provided
imeiSv: '4370816125816151'

# List of gNB IP addresses for Radio Link Simulation
gnbSearchList:
  - 192.168.2.144 # Write the local IP of the RANInstance
  ```
<br>
Run the steps below independently by running 3 or more terminals as you need to run the RAN, UE, and so on.

```bash
sudo su
cd ~/UERANSIM/build
./nr-gnb -c ../config/open5gs-gnb.yaml
```


```bash
sudo su
cd ~/UERANSIM/build
./nr-ue -c ../config/open5gs-ue.yaml
```

```bash
ip address show uesimtun0
```

------
### Step7. Test:
<br>
Connect to the local machine where you deployed the CDK and connect to each 5G Core Pod with the commands below.

```bash
#Commands to connect to each pod
kubectl -n open5gs exec -ti deploy/core5g-amf-1-deployment bash
kubectl -n open5gs exec -ti deploy/core5g-smf-deployment bash 
kubectl -n open5gs exec -ti deploy/core5g-upf-deployment -c upf -- bash

#View each pod log
tail -f /var/log/amf.log
tail -f /var/log/smf.log
tail -f /var/log/up.log
```
<br>
Connect to the CustomerRANInstance and run the ping command using the created GTP tunnel

```bash
# CustomerRANInstance
ping 8.8.8.8 -I uesimtun0
```

------
### Step8. Deploying with a CI/CD pipeline:
<br>
Modify the source code for the patch.

```bash
vi ~/private5g-cloud-deployment/my_open5gs/open5gs/lib/app/ogs-init.c

#line 126, add ogs_info("Hello, 5G");
```
<br>
Modify the image tag value to use for builds during the CI/CD pipeline.

```bash
vi ~/private5g-cloud-deployment/app-cdk/app_cdk/pipeline_cdk_stack.py
#line 14,  Modify the IMAGE_TAG value
```
<br>
Modify the Helm chart.

```bash
vi ~/private5g-cloud-deployment/helm_chart/open5gs-helm-charts_nomultus/values.yaml
#line 5, Modifying tag values
```
<br>
Deploy the CI/CD pipeline to reflect the modifications.

```bash
cd ~/private5g-cloud-deployment/app-cdk/
source .venv/bin/activate
cdk deploy pipeline-cdk-stack
```
<br>
Reflect in CodeCommit.

```bash
cd ~/private5g-cloud-deployment

git add .
git status

git commit -m "Add 'Hello, 5G'"
git status
git push --set-upstream origin main
```
<br>
Change Route53 settings

```bash
upf_ipaddr=$(kubectl -n open5gs exec -ti deploy/core5g-upf-deployment -- ip a | grep "global eth0" | awk '{print $2}' | cut -d '/' -f 1)
echo $upf_ipaddr
amf_ipaddr=$(kubectl -n open5gs exec -ti deploy/core5g-amf-1-deployment -- ip a | grep "global eth0" | awk '{print $2}' | cut -d '/' -f 1)
echo $amf_ipaddr

# Use jq to update the JSON file
cd ~/private5g-cloud-deployment/network_config
jq --arg new_ip "$upf_ipaddr" '.Changes[0].ResourceRecordSet.Name = "upf.open5gs.service" |.Changes[0].ResourceRecordSet.ResourceRecords[0].Value = $new_ip' default_resource.json > upf_resource.json
jq --arg new_ip "$amf_ipaddr" '.Changes[0].ResourceRecordSet.Name = "amf.open5gs.service" |.Changes[0].ResourceRecordSet.ResourceRecords[0].Value = $new_ip' default_resource.json > amf_resource.json

amf_zoneid=$(aws route53 list-hosted-zones-by-name --region us-west-2 | grep -B 1 amf | grep Id | cut -d '/' -f 3 | sed 's/"//g;s/,//g')
echo $amf_zoneid
upf_zoneid=$(aws route53 list-hosted-zones-by-name --region us-west-2 | grep -B 1 upf| grep Id | cut -d '/' -f 3 | sed 's/"//g;s/,//g')
echo $upf_zoneid

aws route53 change-resource-record-sets --hosted-zone-id ${upf_zoneid} --region {{region}}   --change-batch file://{{resource_file}}
aws route53 change-resource-record-sets --hosted-zone-id ${upf_zoneid} --region us-west-2   --change-batch file://upf_resource.json
aws route53 change-resource-record-sets --hosted-zone-id ${amf_zoneid} --region us-west-2   --change-batch file://amf_resource.json
```
<br>
Verify your 5G Core deployment

```bash
kubectl get po -n open5gs
```
<br>
Connect to the local machine where you deployed the CDK and connect to each 5G Core Pod with the commands below.

```bash
#Commands to connect to each pod
kubectl -n open5gs exec -ti deploy/core5g-amf-1-deployment bash
kubectl -n open5gs exec -ti deploy/core5g-smf-deployment bash 

#View each pod log
tail -f /var/log/amf.log
tail -f /var/log/smf.log
```
<br>
Connect to the CustomerRANInstance and run the ping command using the created GTP tunnel

```bash
# CustomerRANInstance
ping 8.8.8.8 -I uesimtun0
```
<br>
UPF log and UPF tcpdump

```bash
kubectl -n open5gs exec -ti deploy/core5g-upf-deployment -c upf -- bash

tail -f /var/log/upf.log

tcpdump -i any -ne -l icmp
```
