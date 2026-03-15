"""Tests for the packager — source archive and Dockerfile generation."""

import io
import tarfile

import pytest

from backend.agents.models import GeneratedFile, GeneratedServer
from backend.pipeline.packager import (
    create_source_archive,
    generate_dockerfile,
    generate_readme,
    generate_env_example,
)


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


class TestGenerateDockerfile:
    def test_dockerfile_has_python_base(self) -> None:
        df = generate_dockerfile(sample_server())
        assert "python:3.12-slim" in df

    def test_dockerfile_copies_requirements(self) -> None:
        df = generate_dockerfile(sample_server())
        assert "requirements.txt" in df

    def test_dockerfile_exposes_port(self) -> None:
        df = generate_dockerfile(sample_server())
        assert "EXPOSE 8000" in df

    def test_dockerfile_has_cmd(self) -> None:
        df = generate_dockerfile(sample_server())
        assert "CMD" in df
        assert "server.py" in df


class TestGenerateReadme:
    def test_readme_has_title(self) -> None:
        readme = generate_readme(sample_server(), "test_mcp")
        assert "test_mcp" in readme

    def test_readme_has_env_vars(self) -> None:
        readme = generate_readme(sample_server(), "test_mcp")
        assert "API_KEY" in readme
        assert "BASE_URL" in readme

    def test_readme_has_docker_instructions(self) -> None:
        readme = generate_readme(sample_server(), "test_mcp")
        assert "docker" in readme.lower()


class TestGenerateEnvExample:
    def test_env_example_has_all_vars(self) -> None:
        env = generate_env_example(sample_server())
        assert "API_KEY=" in env
        assert "BASE_URL=" in env


class TestCreateSourceArchive:
    def test_archive_is_valid_targz(self) -> None:
        archive_bytes = create_source_archive(sample_server(), "test_mcp")
        assert len(archive_bytes) > 0

        # Should be valid tar.gz
        buf = io.BytesIO(archive_bytes)
        with tarfile.open(fileobj=buf, mode="r:gz") as tar:
            names = tar.getnames()
            assert len(names) > 0

    def test_archive_contains_server_py(self) -> None:
        archive_bytes = create_source_archive(sample_server(), "test_mcp")
        buf = io.BytesIO(archive_bytes)
        with tarfile.open(fileobj=buf, mode="r:gz") as tar:
            names = tar.getnames()
            assert any("server.py" in n for n in names)

    def test_archive_contains_dockerfile(self) -> None:
        archive_bytes = create_source_archive(sample_server(), "test_mcp")
        buf = io.BytesIO(archive_bytes)
        with tarfile.open(fileobj=buf, mode="r:gz") as tar:
            names = tar.getnames()
            assert any("Dockerfile" in n for n in names)

    def test_archive_contains_requirements(self) -> None:
        archive_bytes = create_source_archive(sample_server(), "test_mcp")
        buf = io.BytesIO(archive_bytes)
        with tarfile.open(fileobj=buf, mode="r:gz") as tar:
            names = tar.getnames()
            assert any("requirements.txt" in n for n in names)

    def test_archive_contains_readme(self) -> None:
        archive_bytes = create_source_archive(sample_server(), "test_mcp")
        buf = io.BytesIO(archive_bytes)
        with tarfile.open(fileobj=buf, mode="r:gz") as tar:
            names = tar.getnames()
            assert any("README.md" in n for n in names)

    def test_archive_contains_env_example(self) -> None:
        archive_bytes = create_source_archive(sample_server(), "test_mcp")
        buf = io.BytesIO(archive_bytes)
        with tarfile.open(fileobj=buf, mode="r:gz") as tar:
            names = tar.getnames()
            assert any(".env.example" in n for n in names)

    def test_requirements_txt_content(self) -> None:
        archive_bytes = create_source_archive(sample_server(), "test_mcp")
        buf = io.BytesIO(archive_bytes)
        with tarfile.open(fileobj=buf, mode="r:gz") as tar:
            req_member = next(m for m in tar.getmembers() if "requirements.txt" in m.name)
            req_file = tar.extractfile(req_member)
            assert req_file is not None
            content = req_file.read().decode()
            assert "fastmcp>=3.1.0" in content
            assert "httpx>=0.28" in content
