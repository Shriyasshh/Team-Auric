"""Main SDK Client Class."""

from .provider import Provider
from .signer import Signer
from ..utils.constants import DEFAULT_NETWORK, get_rpc_url


class Client:
    def __init__(self, network=DEFAULT_NETWORK, private_key=None):
        self.network = network
        self.provider = Provider(get_rpc_url(network))
        self.signer = None
        if private_key:
            self.signer = Signer(private_key, self.provider)

    @staticmethod
    def create_random(network=DEFAULT_NETWORK):
        client = Client(network)
        client.signer = Signer.create_random(client.provider)
        return client
