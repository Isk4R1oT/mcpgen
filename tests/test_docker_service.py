"""Tests for Docker image build service."""

import os
from unittest.mock import MagicMock, patch

import pytest

from backend.agents.models import GeneratedFile, GeneratedServer
from backend.services.docker_service import build_image, push_image


def sample_server() -> GeneratedServer:
    return GeneratedServer(
        files=[
            GeneratedFile(
                filename="server.py",
                content='from fastmcp import FastMCP\nmcp = FastMCP("test")\n',
                description="Main server",
            ),
        ],
        requirements=["fastmcp>=3.1.0", "httpx>=0.28"],
        env_vars=["API_KEY", "BASE_URL"],
        startup_command="python server.py",
    )


class TestBuildImage:
    @patch("backend.services.docker_service.docker")
    def test_returns_image_tag(self, mock_docker: MagicMock) -> None:
        mock_client = MagicMock()
        mock_docker.from_env.return_value = mock_client
        mock_image = MagicMock()
        mock_client.images.build.return_value = (mock_image, iter([]))

        tag = build_image(
            server=sample_server(),
            server_name="test-mcp",
            tag=None,
        )

        assert tag == "test-mcp:latest"

    @patch("backend.services.docker_service.docker")
    def test_uses_custom_tag(self, mock_docker: MagicMock) -> None:
        mock_client = MagicMock()
        mock_docker.from_env.return_value = mock_client
        mock_image = MagicMock()
        mock_client.images.build.return_value = (mock_image, iter([]))

        tag = build_image(
            server=sample_server(),
            server_name="test-mcp",
            tag="v1.2.3",
        )

        assert tag == "test-mcp:v1.2.3"

    @patch("backend.services.docker_service.docker")
    def test_calls_docker_build(self, mock_docker: MagicMock) -> None:
        mock_client = MagicMock()
        mock_docker.from_env.return_value = mock_client
        mock_image = MagicMock()
        mock_client.images.build.return_value = (mock_image, iter([]))

        build_image(
            server=sample_server(),
            server_name="test-mcp",
            tag=None,
        )

        mock_client.images.build.assert_called_once()
        call_kwargs = mock_client.images.build.call_args[1]
        assert call_kwargs["tag"] == "test-mcp:latest"
        assert call_kwargs["rm"] is True

    @patch("backend.services.docker_service.docker")
    def test_writes_dockerfile_to_build_dir(self, mock_docker: MagicMock) -> None:
        mock_client = MagicMock()
        mock_docker.from_env.return_value = mock_client
        mock_image = MagicMock()
        mock_client.images.build.return_value = (mock_image, iter([]))

        build_image(
            server=sample_server(),
            server_name="test-mcp",
            tag=None,
        )

        call_kwargs = mock_client.images.build.call_args[1]
        build_path = call_kwargs["path"]
        assert os.path.isdir(build_path)
        assert os.path.isfile(os.path.join(build_path, "Dockerfile"))

    @patch("backend.services.docker_service.docker")
    def test_writes_requirements_txt(self, mock_docker: MagicMock) -> None:
        mock_client = MagicMock()
        mock_docker.from_env.return_value = mock_client
        mock_image = MagicMock()
        mock_client.images.build.return_value = (mock_image, iter([]))

        build_image(
            server=sample_server(),
            server_name="test-mcp",
            tag=None,
        )

        call_kwargs = mock_client.images.build.call_args[1]
        build_path = call_kwargs["path"]
        req_path = os.path.join(build_path, "requirements.txt")
        assert os.path.isfile(req_path)
        with open(req_path) as f:
            content = f.read()
        assert "fastmcp>=3.1.0" in content
        assert "httpx>=0.28" in content

    @patch("backend.services.docker_service.docker")
    def test_writes_server_files(self, mock_docker: MagicMock) -> None:
        mock_client = MagicMock()
        mock_docker.from_env.return_value = mock_client
        mock_image = MagicMock()
        mock_client.images.build.return_value = (mock_image, iter([]))

        build_image(
            server=sample_server(),
            server_name="test-mcp",
            tag=None,
        )

        call_kwargs = mock_client.images.build.call_args[1]
        build_path = call_kwargs["path"]
        server_py = os.path.join(build_path, "server.py")
        assert os.path.isfile(server_py)
        with open(server_py) as f:
            content = f.read()
        assert "FastMCP" in content

    @patch("backend.services.docker_service.docker")
    def test_dockerfile_content_is_valid(self, mock_docker: MagicMock) -> None:
        mock_client = MagicMock()
        mock_docker.from_env.return_value = mock_client
        mock_image = MagicMock()
        mock_client.images.build.return_value = (mock_image, iter([]))

        build_image(
            server=sample_server(),
            server_name="test-mcp",
            tag=None,
        )

        call_kwargs = mock_client.images.build.call_args[1]
        build_path = call_kwargs["path"]
        with open(os.path.join(build_path, "Dockerfile")) as f:
            dockerfile = f.read()
        assert "FROM python:3.12-slim" in dockerfile
        assert "COPY requirements.txt" in dockerfile
        assert "CMD" in dockerfile


class TestPushImage:
    @patch("backend.services.docker_service.docker")
    def test_push_tags_and_pushes(self, mock_docker: MagicMock) -> None:
        mock_client = MagicMock()
        mock_docker.from_env.return_value = mock_client
        mock_image = MagicMock()
        mock_client.images.get.return_value = mock_image
        mock_client.images.push.return_value = iter([])

        result = push_image(
            tag="test-mcp:latest",
            registry="registry.example.com",
        )

        assert result == "registry.example.com/test-mcp:latest"
        mock_image.tag.assert_called_once_with("registry.example.com/test-mcp:latest")
        mock_client.images.push.assert_called_once_with(
            "registry.example.com/test-mcp:latest"
        )

    @patch("backend.services.docker_service.docker")
    def test_push_raises_on_docker_error(self, mock_docker: MagicMock) -> None:
        mock_client = MagicMock()
        mock_docker.from_env.return_value = mock_client
        mock_client.images.get.side_effect = Exception("image not found")

        with pytest.raises(Exception, match="image not found"):
            push_image(
                tag="nonexistent:latest",
                registry="registry.example.com",
            )
