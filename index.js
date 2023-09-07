import "dotenv/config";
import {
  assert,
  Contract,
  ethers,
  formatEther,
  JsonRpcProvider,
  MaxUint256,
  Transaction,
  Wallet,
} from "ethers";

const USDC_ABI = [
  "function approve(address spender, uint256 value)",
  "function allowance(address from, address to) view returns (uint256)",
];

const CHAINLOG_ABI = [
  "function getAddress(bytes32 key) view returns (address)",
];

const CHAINLOG = "0xdA0Ab1e0017DEbCd72Be8599041a2aa3bA7e740F";

async function main() {
  const provider = new JsonRpcProvider(process.env.ETH_RPC_URL);
  const wallet = new Wallet(process.env.PKEY, provider);
  const proxy = process.env.PROXY || wallet.address; // should be the address of the approved proxy
  const chainlog = new Contract(CHAINLOG, CHAINLOG_ABI, provider);
  const usdc_addr = await chainlog["getAddress(bytes32)"](
    ethers.encodeBytes32String("USDC")
  );
  const usdc = new Contract(usdc_addr, USDC_ABI, provider);

  const tx = new Transaction();
  const { to, data } = await usdc.approve.populateTransaction(
    proxy,
    MaxUint256
  );
  tx.to = to;
  tx.data = data;
  tx.gasLimit = await usdc.approve.estimateGas(proxy, MaxUint256);
  tx.chainId = (await provider.getNetwork()).chainId;
  const { maxFeePerGas, maxPriorityFeePerGas } = await provider.getFeeData();
  tx.maxFeePerGas = maxFeePerGas;
  tx.maxPriorityFeePerGas = maxPriorityFeePerGas;
  tx.signature = {
    r: "0xda0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da00",
    s: "0x0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0da0",
    v: "0x1b",
  };

  const eoa = tx.from;
  const nonce = await provider.getTransactionCount(eoa);
  assert(nonce === 0, "EOA already used!");
  console.log(`Seedless EOA: ${eoa}`);

  // check allowance
  let allowance = await usdc.allowance(eoa, proxy);
  console.log(`Proxy allowance: ${allowance}`);

  // fund seedless EOA
  const value = tx.maxFeePerGas * tx.gasLimit;
  let txResp = await wallet.sendTransaction({
    to: eoa,
    value,
  });
  console.log(
    `Funding seedless EOA with ${formatEther(value)} ETH... txHash = ${
      txResp.hash
    }`
  );
  await txResp.wait();

  // submit one-time approval tx
  txResp = await provider.broadcastTransaction(tx.serialized);
  console.log(`Approving proxy through one-time tx... txHash = ${txResp.hash}`);
  await txResp.wait();

  // check allowance
  allowance = await usdc.allowance(eoa, proxy);
  console.log(`Proxy allowance: ${allowance}`);
}

main();
