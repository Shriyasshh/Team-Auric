"""Signer class for signing transactions."""

from eth_account import Account
from web3 import Web3

from ..utils.errors import TransactionError, WalletError


class Signer:
    def __init__(self, private_key, provider):
        try:
            self.provider = provider
            self.account = Account.from_key(private_key)
            self.address = self.account.address
        except Exception as err:
            raise WalletError(f"Failed to initialize Wallet: {err}") from err

    @staticmethod
    def create_random(provider):
        account = Account.create()
        return Signer(account.key.hex(), provider)

    def get_private_key(self):
        return "0x" + self.account.key.hex().removeprefix("0x")

    def send_transaction(self, tx):
        try:
            tx.setdefault("from", self.address)
            tx.setdefault("nonce", self.provider.web3.eth.get_transaction_count(self.address))
            tx.setdefault("chainId", self.provider.web3.eth.chain_id)
            if "gasPrice" not in tx and "maxFeePerGas" not in tx:
                tx["gasPrice"] = self.provider.web3.eth.gas_price

            signed = self.account.sign_transaction(tx)
            tx_hash = self.provider.web3.eth.send_raw_transaction(signed.raw_transaction)
            return tx_hash.hex()
        except Exception as err:
            raise TransactionError(f"Transaction failed: {err}") from err

    def send_token(self, token_address, to, amount):
        if not to or not amount or not token_address:
            raise TransactionError("tokenAddress, to, and amount are required for token transfers")

        # ERC20 transfer(address,uint256) method ID: 0xa9059cbb
        data = "0xa9059cbb" + to.replace("0x", "").zfill(64) + hex(int(amount))[2:].zfill(64)

        return self.send_transaction({
            "to": Web3.to_checksum_address(token_address),
            "data": data,
            "gas": 60000,
        })

    def deploy(self, abi, bytecode, args=None):
        args = args or []
        try:
            factory = self.provider.web3.eth.contract(abi=abi, bytecode=bytecode)
            tx = factory.constructor(*args).build_transaction({
                "from": self.address,
                "nonce": self.provider.web3.eth.get_transaction_count(self.address),
            })
            return self.send_transaction(tx)
        except Exception as err:
            raise TransactionError(f"Deployment failed: {err}") from err

    def send_native(self, to, amount):
        if not to or not amount:
            raise TransactionError("Destination address and amount are required")
        return self.send_transaction({
            "to": Web3.to_checksum_address(to),
            "value": int(amount),
            "gas": 21000,
        })

    def get_address(self):
        return self.address

    def estimate_gas(self, method, args):
        try:
            if method == "sendNative":
                to, amount = args
                tx = {"from": self.address, "to": Web3.to_checksum_address(to), "value": int(amount)}
            elif method == "sendToken":
                token_address, to, amount = args
                data = "0xa9059cbb" + to.replace("0x", "").zfill(64) + hex(int(amount))[2:].zfill(64)
                tx = {"from": self.address, "to": Web3.to_checksum_address(token_address), "data": data}
            elif method == "deploy":
                abi, bytecode, constructor_args = (list(args) + [[]])[:3]
                factory = self.provider.web3.eth.contract(abi=abi, bytecode=bytecode)
                tx = factory.constructor(*constructor_args).build_transaction({"from": self.address})
            else:
                raise ValueError(f"Unsupported method for gas estimation: {method}")

            return self.provider.web3.eth.estimate_gas(tx)
        except Exception as err:
            raise TransactionError(f"Gas estimation failed: {err}") from err
