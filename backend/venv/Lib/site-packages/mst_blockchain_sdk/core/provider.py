"""Provider class for interacting with the blockchain."""

from web3 import Web3

from ..utils.errors import ProviderError


class Provider:
    def __init__(self, rpc_url):
        self.rpc_url = rpc_url
        self.web3 = Web3(Web3.HTTPProvider(rpc_url))

    def get_block_number(self):
        try:
            return self.web3.eth.block_number
        except Exception as err:
            raise ProviderError(f"Failed to fetch block number: {err}") from err

    def get_balance(self, address):
        try:
            return self.web3.eth.get_balance(Web3.to_checksum_address(address))
        except Exception as err:
            raise ProviderError(f"Failed to fetch balance for {address}: {err}") from err

    def get_transaction_receipt(self, tx_hash):
        try:
            return self.web3.eth.get_transaction_receipt(tx_hash)
        except Exception as err:
            raise ProviderError(f"Failed to fetch receipt for {tx_hash}: {err}") from err

    def wait_for_transaction(self, tx_hash):
        try:
            return self.web3.eth.wait_for_transaction_receipt(tx_hash)
        except Exception as err:
            raise ProviderError(f"Error while waiting for transaction {tx_hash}: {err}") from err

    def estimate_gas(self, transaction):
        try:
            return self.web3.eth.estimate_gas(transaction)
        except Exception as err:
            raise ProviderError(f"Failed to estimate gas: {err}") from err
