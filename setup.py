from setuptools import setup, find_packages

with open("requirements.txt") as f:
	install_requires = f.read().strip().split("\n")

# get version from __version__ variable in alyf/__init__.py
from alyf import __version__ as version

setup(
	name="alyf",
	version=version,
	description="Customizations",
	author="Alyf",
	author_email="hello@alyf.de",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)
